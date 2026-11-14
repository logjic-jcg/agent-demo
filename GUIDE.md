# Guide pas à pas : mettre en ligne l'agent conversationnel

Ce guide part de zéro. Comptez environ 30 à 45 minutes la première fois.

À la fin, votre application sera accessible à une adresse du type `https://votre-projet.web.app`. Chaque visiteur y saisira son fournisseur (Groq, OpenAI, Mistral…) et sa propre clé API.

---

## 0. Ce que contient le dossier

```
agent-conversationnel/
├── public/              ← le site lui-même (c'est ce dossier que Firebase publie)
│   ├── index.html       ← la page
│   ├── style.css        ← l'apparence
│   └── app.js           ← toute la logique (réglages, appels aux API, affichage)
├── firebase.json        ← configuration de l'hébergement Firebase (+ en-têtes de sécurité)
├── .firebaserc          ← l'identifiant de VOTRE projet Firebase (à modifier, étape 4)
├── .gitignore           ← fichiers que Git doit ignorer
├── README.md            ← présentation du projet (affichée sur GitHub)
└── GUIDE.md             ← ce guide
```

Attention : `.firebaserc` et `.gitignore` commencent par un point. Sur Mac et Windows, ces fichiers sont **masqués par défaut**. Ils existent bien.
- Mac (Finder) : `Cmd + Maj + .` pour les afficher.
- Windows (Explorateur) : menu Affichage, puis cocher « Éléments masqués ».

Il n'y a **aucune clé API dans ces fichiers**. Vous pouvez donc les publier sur un dépôt GitHub public sans risque.

---

## 1. Installer les outils (une seule fois)

### 1.1 Node.js
Firebase CLI (l'outil en ligne de commande de Firebase) a besoin de Node.js.

1. Allez sur https://nodejs.org et téléchargez la version **LTS**.
2. Installez-la (suivant, suivant…).
3. Ouvrez un terminal :
   - Mac : application **Terminal**.
   - Windows : **PowerShell** (menu Démarrer, tapez « PowerShell »).
4. Vérifiez :
   ```bash
   node -v
   npm -v
   ```
   Deux numéros de version doivent s'afficher.

### 1.2 Git
1. Mac : tapez `git --version` dans le Terminal. Si Git n'est pas là, macOS propose de l'installer : acceptez.
2. Windows : téléchargez-le sur https://git-scm.com et installez-le avec les options par défaut.
3. Configurez votre identité (une seule fois) :
   ```bash
   git config --global user.name "Votre Nom"
   git config --global user.email "votre-email@exemple.com"
   ```

### 1.3 Firebase CLI
```bash
npm install -g firebase-tools
firebase --version
```
Sur Mac, si vous obtenez une erreur de permission (`EACCES`), relancez avec `sudo npm install -g firebase-tools` et tapez votre mot de passe de session.

Sur Windows, si PowerShell refuse d'exécuter `firebase` (« l'exécution de scripts est désactivée »), lancez une fois :
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 2. Tester l'application sur votre ordinateur (recommandé AVANT tout le reste)

C'est l'étape la plus importante : elle vous dit si **Groq accepte les appels depuis un navigateur** (voir la section « Limites » plus bas).

1. Dans le terminal, placez-vous dans le dossier du projet :
   ```bash
   cd chemin/vers/agent-conversationnel
   ```
   Astuce : tapez `cd ` (avec un espace) puis glissez le dossier dans la fenêtre du terminal.
2. Lancez un petit serveur local :
   ```bash
   firebase emulators:start --only hosting
   ```
   (La première fois, il peut demander de se connecter : faites d'abord l'étape 3.2 `firebase login`, puis revenez ici. S'il se plaint qu'aucun projet n'est défini, faites d'abord l'étape 4.)
3. Ouvrez l'adresse affichée (en général http://127.0.0.1:5000) dans votre navigateur.
   Sur Mac, le port 5000 est parfois pris par « Récepteur AirPlay ». Dans ce cas, désactivez-le (Réglages Système, Général, AirDrop et Handoff) ou ajoutez `"emulators": { "hosting": { "port": 5050 } }` dans `firebase.json`.
4. Dans **Réglages** : choisissez **Groq**, collez votre clé, cliquez sur **Tester la connexion**.
   - « Connexion réussie » : parfait, continuez.
   - « Impossible de joindre l'API (Failed to fetch) » : voir la section « Limites ».
5. `Ctrl + C` dans le terminal pour arrêter le serveur.

Variante sans Firebase : `npx serve public` puis ouvrez l'adresse indiquée. N'ouvrez **pas** `index.html` par double-clic : certains navigateurs bloquent alors les requêtes.

---

## 3. Créer le projet Firebase

### 3.1 Dans la console web
1. Allez sur https://console.firebase.google.com et connectez-vous avec votre compte Google.
2. **Créer un projet** (ou « Ajouter un projet »).
3. Donnez-lui un nom, par exemple `agent-ia-jc`. Firebase génère un **ID de projet** (parfois avec un suffixe, par exemple `agent-ia-jc-4f2a1`). **Notez cet ID**, il servira à l'étape 4.
4. Google Analytics : vous pouvez le désactiver, il n'est pas utile ici.
5. Le forfait gratuit **Spark** suffit : l'hébergement statique y est inclus. Aucune carte bancaire n'est nécessaire.

### 3.2 Connecter le terminal à votre compte
```bash
firebase login
```
Une page s'ouvre dans le navigateur : choisissez votre compte Google et autorisez. Vérifiez ensuite :
```bash
firebase projects:list
```
Votre projet doit apparaître dans la liste.

---

## 4. Relier le dossier à votre projet Firebase

Ouvrez `.firebaserc` avec un éditeur de texte (Bloc-notes, TextEdit en mode texte brut, VS Code…) et remplacez `REMPLACEZ-PAR-L-ID-DE-VOTRE-PROJET-FIREBASE` par l'ID noté à l'étape 3.1 :

```json
{
  "projects": {
    "default": "agent-ia-jc-4f2a1"
  }
}
```

Autre méthode, sans éditer le fichier : dans le dossier du projet, tapez `firebase use --add`, choisissez votre projet avec les flèches, puis tapez l'alias `default`.

### Et `firebase init hosting` ?
Vous n'en avez **pas besoin** : `firebase.json` est déjà fourni et configuré. Si vous le lancez quand même, répondez ainsi :
- *What do you want to use as your public directory?* → `public`
- *Configure as a single-page app?* → `No`
- *Set up automatic builds and deploys with GitHub?* → `No` (on le fait à l'étape 7)
- *File public/index.html already exists. Overwrite?* → **`No`** (sinon votre page est remplacée par la page d'exemple de Firebase)

Attention : `firebase init` peut réécrire `firebase.json` et y supprimer les en-têtes de sécurité. Si c'est le cas, remettez le fichier fourni.

---

## 5. Mettre le code sur GitHub

### 5.1 Créer le dépôt
1. Allez sur https://github.com/new (créez un compte si besoin).
2. Nom du dépôt : par exemple `agent-conversationnel`.
3. Public ou privé : les deux fonctionnent.
4. **Ne cochez pas** « Add a README » (nous en avons déjà un).
5. Cliquez sur **Create repository**. GitHub affiche une adresse du type `https://github.com/VOTRE-PSEUDO/agent-conversationnel.git`.

### 5.2 Envoyer les fichiers
Dans le terminal, depuis le dossier du projet :
```bash
git init
git add .
git commit -m "Première version de l'agent conversationnel"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/agent-conversationnel.git
git push -u origin main
```
Au premier `git push`, GitHub demande de vous identifier. Le plus simple est la fenêtre de connexion qui s'ouvre. Si on vous demande un mot de passe dans le terminal, votre mot de passe GitHub **ne marchera pas** : il faut un « Personal access token » (GitHub, Settings, Developer settings, Personal access tokens), ou plus simplement installer **GitHub Desktop** (https://desktop.github.com) qui gère la connexion pour vous.

Rechargez la page du dépôt sur GitHub : vos fichiers doivent y être.

Alternative sans terminal : GitHub Desktop, menu « Add local repository », puis « Publish repository ».

---

## 6. Mettre en ligne sur Firebase

Depuis le dossier du projet :
```bash
firebase deploy --only hosting
```
À la fin, le terminal affiche :
```
Hosting URL: https://agent-ia-jc-4f2a1.web.app
```
Ouvrez cette adresse : votre application est en ligne. Refaites le test « Tester la connexion » avec votre clé Groq.

Pour toute modification ultérieure : modifiez les fichiers, puis relancez `firebase deploy --only hosting` (et `git add . && git commit -m "..." && git push` pour garder GitHub à jour).

---

## 7. (Facultatif) Déploiement automatique à chaque push sur GitHub

Ainsi, chaque `git push` sur `main` met le site à jour, sans retaper `firebase deploy`.

```bash
firebase init hosting:github
```
Répondez :
- *For which GitHub repository would you like to set up a GitHub workflow?* → `VOTRE-PSEUDO/agent-conversationnel`
- *Set up the workflow to run a build script before every deploy?* → `No` (il n'y a rien à compiler)
- *Set up automatic deployment to your site's live channel when a PR is merged?* → `Yes`
- *What is the name of the GitHub branch associated with your site's live channel?* → `main`

L'outil vous fait autoriser GitHub dans le navigateur, crée tout seul la clé secrète dans votre dépôt GitHub, et ajoute deux fichiers dans `.github/workflows/`. Envoyez-les sur GitHub :
```bash
git add .
git commit -m "Déploiement automatique Firebase"
git push
```
Sur GitHub, onglet **Actions** : vous voyez le déploiement s'exécuter (coche verte = réussi).

Bonus : quand quelqu'un ouvre une « pull request », le deuxième fichier crée une adresse de prévisualisation temporaire pour tester avant de publier.

---

## 8. Limites, à lire honnêtement

### 8.1 CORS : certains fournisseurs bloquent les appels depuis un navigateur
L'application appelle l'API **directement depuis le navigateur** du visiteur. Le navigateur n'autorise cela que si le fournisseur renvoie des en-têtes « CORS » qui l'acceptent. C'est le fournisseur qui décide, pas nous.

Ce que je sais, et avec quel niveau de certitude :

| Fournisseur | Appel direct depuis le navigateur | Niveau de certitude |
|---|---|---|
| Anthropic (Claude) | Oui, avec l'en-tête `anthropic-dangerous-direct-browser-access: true` (déjà géré par l'application) | **Vérifié** le 14/11/2026 : leur serveur répond `Access-Control-Allow-Origin: *` |
| OpenAI | Oui, en principe | Non testé par moi. Le forum officiel d'OpenAI montre que ça fonctionne, avec une panne temporaire corrigée en janvier 2026 |
| OpenRouter | Oui, en principe (c'est un usage courant) | Non testé par moi |
| **Groq** | **Je ne sais pas avec certitude** | Non testé : les sources trouvées se contredisent et ne sont pas fiables. **Faites le test de l'étape 2** |
| Mistral, DeepSeek | Je ne sais pas | Non testé |
| Google Gemini (point d'accès compatible OpenAI) | Incertain | Des développeurs signalent des erreurs CORS avec la bibliothèque OpenAI, et un contournement qui marche. Avec l'appel simple de cette application, ça devrait passer, mais je n'ai pas pu le vérifier |

Pourquoi je n'ai pas pu tout tester : l'environnement dans lequel j'ai construit l'application n'avait pas accès à ces serveurs.

**Si un fournisseur bloque** (message « Failed to fetch », et « CORS » dans la console F12), il faut un petit relais (proxy) entre le navigateur et l'API. Options :
- Une fonction Cloudflare Workers (gratuite) ou une Firebase Cloud Function (demande le forfait payant Blaze).
- Dans l'application, choisissez « Autre (compatible OpenAI) » et mettez l'adresse du relais dans « URL de l'API ».
- Conséquence importante : la clé de l'utilisateur passera alors par **votre** relais. Il faut que vos utilisateurs vous fassent confiance, et votre relais ne doit jamais enregistrer les clés.

### 8.2 Sécurité des clés côté navigateur
- La clé est stockée **dans le navigateur de l'utilisateur** (localStorage si « Mémoriser » est coché, sinon sessionStorage, effacé à la fermeture de l'onglet). Elle n'est jamais envoyée à Firebase ni à vous, uniquement au fournisseur choisi.
- **Risque principal : une faille XSS** (du code JavaScript malveillant injecté dans la page) pourrait lire la clé. Protections mises en place :
  - les réponses de l'IA sont affichées comme du texte, jamais interprétées comme du HTML (testé avec une réponse contenant une balise `<script>` : non exécutée) ;
  - `firebase.json` ajoute une politique de sécurité (Content-Security-Policy) qui interdit tout script venant d'ailleurs que votre site ;
  - aucune bibliothèque externe n'est chargée.
- **Les extensions de navigateur** peuvent lire le contenu des pages : un utilisateur avec une extension malveillante peut se faire voler sa clé. Vous n'y pouvez rien.
- **Sur un ordinateur partagé**, ne cochez pas « Mémoriser la clé », et utilisez « Effacer mes clés » en partant.
- Conseillez à vos utilisateurs de fixer une **limite de dépense** chez leur fournisseur et de créer une clé dédiée à cette application, qu'ils peuvent révoquer à tout moment.
- **Ne mettez jamais votre propre clé dans le code** (`app.js`) : tout le monde pourrait la lire et l'utiliser à vos frais.

### 8.3 Autres limites
- La conversation n'est pas sauvegardée : elle disparaît si vous rechargez la page.
- Les noms de modèles par défaut sont des suggestions qui peuvent devenir obsolètes (les fournisseurs retirent régulièrement des modèles). Utilisez le bouton **Charger la liste** pour voir les modèles réellement disponibles avec votre clé.
- Pas d'envoi d'images ni de fichiers : texte uniquement.

---

## 9. En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| `firebase: command not found` | Firebase CLI non installé, ou terminal ouvert avant l'installation | Fermez et rouvrez le terminal, refaites l'étape 1.3 |
| `Error: Failed to get Firebase project` | Mauvais ID dans `.firebaserc` | Vérifiez l'ID avec `firebase projects:list` (étape 4) |
| Le site affiche la page d'exemple de Firebase (« Firebase Hosting Setup Complete ») | `index.html` a été écrasé par `firebase init` | Remettez le fichier `public/index.html` fourni et redéployez |
| Erreur 401 dans l'application | Clé invalide, ou clé d'un autre fournisseur | Recopiez la clé, vérifiez le fournisseur choisi |
| Erreur 404 ou 400 | Nom de modèle incorrect | Bouton « Charger la liste » |
| Erreur 429 | Quota ou limite de débit atteint | Attendez, ou vérifiez votre crédit chez le fournisseur |
| « Failed to fetch » | CORS ou réseau | Section 8.1 |
| Les modifications n'apparaissent pas en ligne | Cache du navigateur | `Ctrl + Maj + R` (Windows) ou `Cmd + Maj + R` (Mac) |
