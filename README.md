# Agent conversationnel multi-fournisseurs

Petite application web (HTML, CSS et JavaScript, sans compilation) pour discuter avec un modèle d'IA générative en utilisant **votre propre clé API**.

Fournisseurs proposés : Groq, OpenAI, Mistral AI, OpenRouter, Anthropic (Claude), Google Gemini, DeepSeek, et tout service compatible OpenAI.

## Fonctionnement

- Chaque visiteur choisit son fournisseur, colle sa clé API et choisit un modèle (bouton « Charger la liste » pour voir les modèles disponibles).
- La clé est stockée **uniquement dans le navigateur** du visiteur et envoyée **uniquement** à l'API du fournisseur. Il n'y a aucun serveur intermédiaire.
- Réponses affichées au fil de l'eau (streaming), bouton Arrêter, instructions système, température.

## Lancer en local

```bash
firebase emulators:start --only hosting
# ou
npx serve public
```

## Déployer

Voir **[GUIDE.md](GUIDE.md)** : guide pas à pas (GitHub, Firebase CLI, déploiement, déploiement automatique avec GitHub Actions).

## Limites

- Certains fournisseurs peuvent bloquer les appels depuis un navigateur (CORS). Voir GUIDE.md, section 8.1.
- Une clé stockée dans un navigateur peut être lue par une extension malveillante ou une faille XSS. Utilisez une clé dédiée avec une limite de dépense.
