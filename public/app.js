/*
 * Agent conversationnel multi-fournisseurs
 * ----------------------------------------
 * Application 100 % côté navigateur : la clé API de l'utilisateur est stockée
 * dans son navigateur (localStorage ou sessionStorage) et n'est envoyée qu'à
 * l'API du fournisseur choisi. Aucun serveur intermédiaire.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Fournisseurs
  // kind "openai"    : API compatible OpenAI (POST {baseUrl}/chat/completions)
  // kind "anthropic" : API Messages d'Anthropic (POST {baseUrl}/messages)
  // Les modèles par défaut ne sont que des suggestions : les catalogues changent
  // souvent, utilisez « Charger la liste » pour voir les modèles disponibles.
  // ---------------------------------------------------------------------------
  const PROVIDERS = {
    groq: {
      label: "Groq",
      kind: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      keyUrl: "https://console.groq.com/keys",
      note: "API compatible OpenAI.",
    },
    openai: {
      label: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      keyUrl: "https://platform.openai.com/api-keys",
      note: "",
    },
    mistral: {
      label: "Mistral AI",
      kind: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      model: "mistral-small-latest",
      keyUrl: "https://console.mistral.ai/api-keys",
      note: "API compatible OpenAI.",
    },
    openrouter: {
      label: "OpenRouter",
      kind: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openrouter/auto",
      keyUrl: "https://openrouter.ai/keys",
      note: "Donne accès à de nombreux modèles (certains gratuits) avec une seule clé.",
    },
    anthropic: {
      label: "Anthropic (Claude)",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-5",
      keyUrl: "https://console.anthropic.com/settings/keys",
      note: "Appel direct depuis le navigateur autorisé grâce à l'en-tête anthropic-dangerous-direct-browser-access.",
    },
    gemini: {
      label: "Google Gemini",
      kind: "openai",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.5-flash",
      keyUrl: "https://aistudio.google.com/apikey",
      note: "Via le point d'accès compatible OpenAI de Google.",
    },
    deepseek: {
      label: "DeepSeek",
      kind: "openai",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      keyUrl: "https://platform.deepseek.com/api_keys",
      note: "API compatible OpenAI.",
    },
    custom: {
      label: "Autre (compatible OpenAI)",
      kind: "openai",
      baseUrl: "https://",
      model: "",
      keyUrl: "",
      note: "Tout service qui expose /chat/completions au format OpenAI (Together, Fireworks, Ollama local, votre propre proxy…).",
    },
  };

  const SETTINGS_KEY = "agent.settings.v1";
  const KEYS_KEY = "agent.keys.v1";
  const ANTHROPIC_MAX_TOKENS = 4096;

  // ---------------------------------------------------------------------------
  // Stockage (toujours protégé par try/catch : navigation privée, etc.)
  // ---------------------------------------------------------------------------
  const store = {
    get(area, key) {
      try { return JSON.parse(area.getItem(key) || "null"); } catch { return null; }
    },
    set(area, key, value) {
      try { area.setItem(key, JSON.stringify(value)); } catch { /* ignoré */ }
    },
    remove(area, key) {
      try { area.removeItem(key); } catch { /* ignoré */ }
    },
  };

  function loadSettings() {
    const s = store.get(localStorage, SETTINGS_KEY) || {};
    const provider = PROVIDERS[s.provider] ? s.provider : "groq";
    return {
      provider,
      baseUrl: s.baseUrl || PROVIDERS[provider].baseUrl,
      model: s.model ?? PROVIDERS[provider].model,
      system: s.system || "",
      temperature: typeof s.temperature === "number" ? s.temperature : 0.7,
      remember: !!s.remember,
      perProvider: s.perProvider || {}, // mémorise baseUrl/model par fournisseur
    };
  }

  function saveSettings(s) { store.set(localStorage, SETTINGS_KEY, s); }

  // Clés : un objet { fournisseur: clé } dans localStorage (si « mémoriser »)
  // ou dans sessionStorage (effacé à la fermeture de l'onglet).
  function loadKeys() {
    return { ...(store.get(localStorage, KEYS_KEY) || {}), ...(store.get(sessionStorage, KEYS_KEY) || {}) };
  }
  function saveKey(provider, key, remember) {
    const local = store.get(localStorage, KEYS_KEY) || {};
    const session = store.get(sessionStorage, KEYS_KEY) || {};
    delete local[provider];
    delete session[provider];
    if (key) (remember ? local : session)[provider] = key;
    store.set(localStorage, KEYS_KEY, local);
    store.set(sessionStorage, KEYS_KEY, session);
  }
  function forgetAllKeys() {
    store.remove(localStorage, KEYS_KEY);
    store.remove(sessionStorage, KEYS_KEY);
  }

  // ---------------------------------------------------------------------------
  // État
  // ---------------------------------------------------------------------------
  let settings = loadSettings();
  let history = []; // [{ role: "user" | "assistant", content: string }]
  let controller = null;

  // ---------------------------------------------------------------------------
  // Éléments
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const el = {
    messages: $("messages"), empty: $("empty-state"), chat: $("chat"),
    composer: $("composer"), input: $("input"), send: $("btn-send"), stop: $("btn-stop"),
    newChat: $("btn-new"), openSettings: $("btn-settings"), pill: $("status-pill"),
    dialog: $("settings"), form: $("settings-form"), provider: $("provider"),
    providerNote: $("provider-note"), baseUrl: $("base-url"), apiKey: $("api-key"),
    toggleKey: $("btn-toggle-key"), keyLink: $("key-link"), remember: $("remember"),
    model: $("model"), modelSelect: $("model-select"), loadModels: $("btn-models"),
    system: $("system"), temperature: $("temperature"), tempValue: $("temp-value"),
    settingsMsg: $("settings-msg"), forget: $("btn-forget"), test: $("btn-test"),
  };

  // ---------------------------------------------------------------------------
  // Rendu Markdown minimal et SÛR (aucun innerHTML avec du contenu externe)
  // Gère : blocs ```code```, `code`, **gras**, paragraphes.
  // ---------------------------------------------------------------------------
  function renderInline(parent, text) {
    const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const token = m[0];
      const node = token.startsWith("`") ? document.createElement("code") : document.createElement("strong");
      node.textContent = token.startsWith("`") ? token.slice(1, -1) : token.slice(2, -2);
      parent.appendChild(node);
      last = m.index + token.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMarkdown(container, text) {
    container.replaceChildren();
    const parts = text.split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        // bloc de code : la première ligne peut être le langage
        const nl = part.indexOf("\n");
        const code = nl >= 0 ? part.slice(nl + 1) : part;
        const pre = document.createElement("pre");
        const c = document.createElement("code");
        c.textContent = code.replace(/\n$/, "");
        pre.appendChild(c);
        container.appendChild(pre);
      } else {
        part.split(/\n{2,}/).forEach((para) => {
          if (!para.trim()) return;
          const p = document.createElement("p");
          renderInline(p, para.replace(/^\n+|\n+$/g, ""));
          container.appendChild(p);
        });
      }
    });
  }

  function addMessage(role, text) {
    el.empty.hidden = true;
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    const label = document.createElement("div");
    label.className = "role";
    label.textContent = role === "user" ? "Vous" : role === "assistant" ? PROVIDERS[settings.provider].label + " · " + settings.model : "Erreur";
    const body = document.createElement("div");
    body.className = "body";
    div.append(label, body);
    if (role === "error") body.textContent = text; else renderMarkdown(body, text);
    el.messages.appendChild(div);
    scrollToBottom();
    return body;
  }

  function scrollToBottom() { el.chat.scrollTop = el.chat.scrollHeight; }

  function updatePill() {
    const keys = loadKeys();
    const p = PROVIDERS[settings.provider];
    if (keys[settings.provider] && settings.model) {
      el.pill.textContent = `${p.label} · ${settings.model}`;
      el.pill.title = el.pill.textContent;
    } else {
      el.pill.textContent = "Non configuré";
      el.pill.title = "";
    }
  }

  // ---------------------------------------------------------------------------
  // Appels API
  // ---------------------------------------------------------------------------
  function trimUrl(u) { return u.trim().replace(/\/+$/, ""); }

  function buildRequest(cfg, messages, stream) {
    const base = trimUrl(cfg.baseUrl);
    const p = PROVIDERS[cfg.provider];
    if (p.kind === "anthropic") {
      const body = {
        model: cfg.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages,
        stream,
        temperature: Math.min(cfg.temperature, 1), // Anthropic : 0 à 1
      };
      if (cfg.system.trim()) body.system = cfg.system.trim();
      return {
        url: `${base}/messages`,
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": cfg.key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify(body),
        },
      };
    }
    const msgs = cfg.system.trim() ? [{ role: "system", content: cfg.system.trim() }, ...messages] : messages;
    return {
      url: `${base}/chat/completions`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, messages: msgs, stream, temperature: cfg.temperature }),
      },
    };
  }

  // Transforme une erreur réseau / HTTP en message compréhensible.
  async function explainHttpError(res) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.error?.message || data?.message || data?.detail || JSON.stringify(data);
    } catch {
      try { detail = await res.text(); } catch { /* ignoré */ }
    }
    const hints = {
      400: "Requête refusée : le nom du modèle est peut-être incorrect.",
      401: "Clé API invalide ou expirée.",
      403: "Accès refusé : la clé n'a pas les droits pour ce modèle, ou le compte n'est pas activé.",
      404: "Introuvable : le modèle n'est sans doute pas disponible avec votre clé. Cliquez sur « Charger la liste » pour en choisir un disponible.",
      429: "Trop de requêtes ou quota épuisé : attendez un peu ou vérifiez votre crédit chez le fournisseur.",
    };
    const hint = hints[res.status] || (res.status >= 500 ? "Le fournisseur rencontre un problème, réessayez plus tard." : "");
    return `Erreur HTTP ${res.status}. ${hint}\n\nDétail renvoyé par le fournisseur : ${String(detail).slice(0, 600)}`;
  }

  function explainNetworkError(err) {
    if (err.name === "AbortError") return null;
    return (
      "Impossible de joindre l'API (" + err.message + ").\n\n" +
      "Causes possibles :\n" +
      "• Le fournisseur bloque les appels directs depuis un navigateur (CORS). " +
      "Dans ce cas, il faut passer par un petit serveur intermédiaire (proxy) : voir le guide, section « Limites ».\n" +
      "• L'URL de l'API est incorrecte.\n" +
      "• Pas de connexion internet, ou un bloqueur (pare-feu d'entreprise, extension) empêche la requête.\n\n" +
      "Astuce : ouvrez la console du navigateur (F12, onglet Console). Un message contenant « CORS » confirme la première cause."
    );
  }

  // Lit un flux SSE et appelle onEvent(dataString) pour chaque ligne « data: ».
  async function readSSE(res, onEvent) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("data:")) onEvent(line.slice(5).trim());
      }
    }
    const rest = buffer.trim();
    if (rest.startsWith("data:")) onEvent(rest.slice(5).trim());
  }

  async function streamChat(cfg, messages, onDelta, signal) {
    const { url, init } = buildRequest(cfg, messages, true);
    const res = await fetch(url, { ...init, signal });
    if (!res.ok) throw new HttpError(await explainHttpError(res));

    const isAnthropic = PROVIDERS[cfg.provider].kind === "anthropic";
    const contentType = res.headers.get("content-type") || "";

    // Certains services compatibles ignorent stream:true et répondent en JSON.
    if (!contentType.includes("text/event-stream") || !res.body) {
      const data = await res.json();
      const text = isAnthropic
        ? (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("")
        : data.choices?.[0]?.message?.content || "";
      onDelta(text);
      return;
    }

    await readSSE(res, (data) => {
      if (!data || data === "[DONE]") return;
      let evt;
      try { evt = JSON.parse(data); } catch { return; }
      if (evt.error) throw new HttpError("Erreur du fournisseur : " + (evt.error.message || JSON.stringify(evt.error)));
      if (isAnthropic) {
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") onDelta(evt.delta.text);
      } else {
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      }
    });
  }

  async function listModels(cfg) {
    const base = trimUrl(cfg.baseUrl);
    const isAnthropic = PROVIDERS[cfg.provider].kind === "anthropic";
    const headers = isAnthropic
      ? { "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      : { authorization: `Bearer ${cfg.key}` };
    const res = await fetch(`${base}/models${isAnthropic ? "?limit=100" : ""}`, { headers });
    if (!res.ok) throw new HttpError(await explainHttpError(res));
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.data || data.models || [];
    return items.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean).sort();
  }

  class HttpError extends Error {}

  function errorText(err) {
    if (err instanceof HttpError) return err.message;
    return explainNetworkError(err) || "";
  }

  // ---------------------------------------------------------------------------
  // Conversation
  // ---------------------------------------------------------------------------
  function currentConfig() {
    return { ...settings, key: loadKeys()[settings.provider] || "" };
  }

  async function send(text) {
    const cfg = currentConfig();
    if (!cfg.key || !cfg.model) {
      openSettings("Renseignez d'abord votre clé API et un modèle.");
      return;
    }
    history.push({ role: "user", content: text });
    addMessage("user", text);

    const body = addMessage("assistant", "");
    body.classList.add("cursor");
    let answer = "";
    setBusy(true);
    controller = new AbortController();

    try {
      await streamChat(cfg, history, (delta) => {
        answer += delta;
        renderMarkdown(body, answer);
        scrollToBottom();
      }, controller.signal);
      if (!answer) answer = "(réponse vide)";
      renderMarkdown(body, answer);
      history.push({ role: "assistant", content: answer });
    } catch (err) {
      const msg = errorText(err);
      if (answer) {
        // interrompu en cours de route : on garde ce qui a été reçu
        history.push({ role: "assistant", content: answer });
      } else {
        body.parentElement.remove();
        history.pop(); // retire la question pour pouvoir la renvoyer
        el.input.value = text;
        autoGrow();
      }
      if (msg) addMessage("error", msg);
    } finally {
      body.classList.remove("cursor");
      setBusy(false);
      controller = null;
    }
  }

  function setBusy(busy) {
    el.send.hidden = busy;
    el.stop.hidden = !busy;
    el.input.disabled = busy;
    if (!busy) el.input.focus();
  }

  function newConversation() {
    if (controller) controller.abort();
    history = [];
    el.messages.replaceChildren();
    el.empty.hidden = false;
    el.input.focus();
  }

  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 200) + "px";
  }

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------
  function fillProviderSelect() {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = p.label;
      el.provider.appendChild(o);
    }
  }

  function showProvider(id, useSaved) {
    const p = PROVIDERS[id];
    const saved = settings.perProvider[id] || {};
    el.provider.value = id;
    el.providerNote.textContent = p.note;
    el.baseUrl.value = (useSaved && saved.baseUrl) || p.baseUrl;
    el.model.value = useSaved && saved.model != null ? saved.model : p.model;
    el.apiKey.value = loadKeys()[id] || "";
    if (p.keyUrl) {
      el.keyLink.href = p.keyUrl;
      el.keyLink.textContent = p.keyUrl.replace("https://", "");
      el.keyLink.parentElement.hidden = false;
    } else {
      el.keyLink.parentElement.hidden = true;
    }
    el.modelSelect.replaceChildren();
    el.modelSelect.hidden = true;
    setSettingsMsg("");
  }

  function openSettings(message) {
    showProvider(settings.provider, true);
    el.baseUrl.value = settings.baseUrl;
    el.model.value = settings.model;
    el.system.value = settings.system;
    el.temperature.value = settings.temperature;
    el.tempValue.textContent = settings.temperature;
    el.remember.checked = settings.remember;
    el.apiKey.type = "password";
    el.toggleKey.textContent = "Afficher";
    setSettingsMsg(message || "");
    el.dialog.showModal();
  }

  function setSettingsMsg(text, kind) {
    el.settingsMsg.textContent = text;
    el.settingsMsg.className = "note" + (kind ? " " + kind : "");
  }

  function readForm() {
    return {
      provider: el.provider.value,
      baseUrl: trimUrl(el.baseUrl.value),
      model: el.model.value.trim(),
      system: el.system.value,
      temperature: Number(el.temperature.value),
      remember: el.remember.checked,
      key: el.apiKey.value.trim(),
    };
  }

  function persistForm() {
    const f = readForm();
    settings = {
      ...settings,
      provider: f.provider,
      baseUrl: f.baseUrl,
      model: f.model,
      system: f.system,
      temperature: f.temperature,
      remember: f.remember,
      perProvider: { ...settings.perProvider, [f.provider]: { baseUrl: f.baseUrl, model: f.model } },
    };
    saveSettings(settings);
    saveKey(f.provider, f.key, f.remember);
    updatePill();
  }

  function validateForm() {
    const f = readForm();
    if (!/^https?:\/\/[^/]+/.test(f.baseUrl)) return "L'URL de l'API doit commencer par https://";
    if (!f.key) return "Collez votre clé API.";
    if (!f.model) return "Indiquez un modèle (ou cliquez sur « Charger la liste »).";
    return "";
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------
  el.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text || controller) return;
    el.input.value = "";
    autoGrow();
    send(text);
  });

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });
  el.input.addEventListener("input", autoGrow);

  el.stop.addEventListener("click", () => controller && controller.abort());
  el.newChat.addEventListener("click", newConversation);
  el.openSettings.addEventListener("click", () => openSettings());

  el.provider.addEventListener("change", () => showProvider(el.provider.value, true));

  el.toggleKey.addEventListener("click", () => {
    const show = el.apiKey.type === "password";
    el.apiKey.type = show ? "text" : "password";
    el.toggleKey.textContent = show ? "Masquer" : "Afficher";
  });

  el.temperature.addEventListener("input", () => { el.tempValue.textContent = el.temperature.value; });

  el.form.addEventListener("submit", (e) => {
    const problem = validateForm();
    if (problem) {
      e.preventDefault();
      setSettingsMsg(problem, "bad");
      return;
    }
    persistForm();
    // le <form method="dialog"> ferme la fenêtre tout seul
  });

  el.loadModels.addEventListener("click", async () => {
    const f = readForm();
    if (!f.key) { setSettingsMsg("Collez d'abord votre clé API.", "bad"); return; }
    setSettingsMsg("Chargement des modèles…");
    el.loadModels.disabled = true;
    try {
      const models = await listModels(f);
      const placeholder = Object.assign(document.createElement("option"), { value: "", textContent: "— Choisir un modèle dans la liste —" });
      el.modelSelect.replaceChildren(placeholder, ...models.map((id) => Object.assign(document.createElement("option"), { value: id, textContent: id })));
      el.modelSelect.hidden = !models.length;
      if (!models.length) {
        setSettingsMsg("Le fournisseur n'a renvoyé aucun modèle.", "bad");
      } else if (models.includes(f.model)) {
        el.modelSelect.value = f.model;
        setSettingsMsg(`${models.length} modèles trouvés. Le modèle « ${f.model} » est disponible. Vous pouvez en choisir un autre dans la liste déroulante.`, "ok");
      } else {
        // Le modèle saisi n'est pas proposé : on en choisit un de discussion automatiquement.
        const notChat = /whisper|tts|speech|audio|embed|guard|moderation|transcri|image|dall-e|playai|orpheus/i;
        const pick = models.find((id) => !notChat.test(id)) || models[0];
        el.model.value = pick;
        el.modelSelect.value = pick;
        setSettingsMsg(`${models.length} modèles trouvés. « ${f.model || "(vide)"} » n'y figure pas : j'ai sélectionné « ${pick} ». Vous pouvez en choisir un autre dans la liste déroulante. Cliquez ensuite sur « Tester la connexion ».`, "ok");
      }
    } catch (err) {
      setSettingsMsg(errorText(err) || "Échec du chargement.", "bad");
    } finally {
      el.loadModels.disabled = false;
    }
  });

  el.modelSelect.addEventListener("change", () => {
    if (el.modelSelect.value) el.model.value = el.modelSelect.value;
  });

  el.test.addEventListener("click", async () => {
    const problem = validateForm();
    if (problem) { setSettingsMsg(problem, "bad"); return; }
    const f = readForm();
    setSettingsMsg("Test en cours…");
    el.test.disabled = true;
    let reply = "";
    try {
      await streamChat({ ...f }, [{ role: "user", content: "Réponds juste : OK" }], (d) => { reply += d; });
      setSettingsMsg(`Connexion réussie. Réponse du modèle : « ${reply.trim().slice(0, 80)} »`, "ok");
    } catch (err) {
      setSettingsMsg(errorText(err) || "Échec du test.", "bad");
    } finally {
      el.test.disabled = false;
    }
  });

  el.forget.addEventListener("click", () => {
    forgetAllKeys();
    el.apiKey.value = "";
    updatePill();
    setSettingsMsg("Toutes vos clés ont été effacées de ce navigateur.", "ok");
  });

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------
  fillProviderSelect();
  updatePill();
  if (!loadKeys()[settings.provider]) openSettings();
  else el.input.focus();
})();
