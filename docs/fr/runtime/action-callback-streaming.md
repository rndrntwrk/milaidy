---
title: Callbacks d'actions et streaming SSE
description: Pourquoi Milady remplace (au lieu de concaténer) le texte des callbacks d'actions dans le chat du tableau de bord, et comment cela correspond aux messages progressifs style Discord.
---

<div id="action-callbacks-and-sse-streaming">
# Callbacks d'actions et streaming SSE
</div>

Le chat du tableau de bord de Milady utilise les **Server-Sent Events (SSE)** pour transmettre la réponse de l'assistant. Deux types de texte différents arrivent sur le même flux :

1. **Tokens LLM** — la réponse transmise du modèle (`onStreamChunk`).
2. **Callbacks d'actions** — texte renvoyé par `HandlerCallback` pendant l'exécution d'une action (p. ex. `PLAY_AUDIO`, flux de portefeuille, replis de compétences Binance).

Cette page explique **comment ils sont combinés** et **pourquoi** cette conception correspond aux plateformes comme Discord et Telegram.

---

<div id="the-problem-we-solved">
## Le problème que nous avons résolu
</div>

Sur **Discord**, `@elizaos/plugin-discord` utilise un **message progressif** : un message de canal est créé, puis **modifié sur place** à mesure que les mises à jour de statut arrivent ("Recherche de piste…", "Recherche…", "Lecture en cours : …").

Sur le **web**, chaque `callback({ text })` passait auparavant par le même chemin de fusion que les fragments transmis arbitraires. Les chaînes de statut sans rapport ne partagent pas de préfixe entre elles, donc l'heuristique de fusion les **concaténait** souvent :

```text
🔍 Looking up track...🔍 Searching for track...✨ Setting up playback...Now playing: **Song**
```

C'est correct pour les **deltas de tokens** qui prolongent la même réponse, mais incorrect pour les **statuts successifs** qui devraient **remplacer** le statut précédent.

**Pourquoi c'est important :** Les utilisateurs s'attendent à des **mises à jour en direct et sur place** (temps réel style web2), pas à une pile croissante de fragments de statut. Les plugins ne devraient pas avoir besoin d'un second transport (WebSocket, événements personnalisés) juste pour atteindre la parité avec Discord.

---

<div id="the-milady-behavior">
## Le comportement de Milady
</div>

Dans `generateChatResponse` (`packages/agent/src/api/chat-routes.ts`) :

- Les **fragments LLM** utilisent toujours la sémantique **append** via `appendIncomingText` → `resolveStreamingUpdate` → `onChunk`.
- Les **callbacks d'actions** utilisent **`replaceCallbackText`** :
  - Au **premier** callback d'un tour, le serveur prend un instantané de ce qui a déjà été transmis (`preCallbackText` — généralement le texte partiel ou final du LLM).
  - Chaque callback **suivant** définit la réponse visible comme :

    `preCallbackText + "\n\n" + latestCallbackText`

  - Ainsi le **segment de callback** est **remplacé** à chaque fois ; le préfixe LLM est préservé.

La couche HTTP émet un **instantané** (`onSnapshot`) de sorte que l'événement SSE transporte le nouveau `fullText` **complet**. Le client traite déjà `fullText` comme faisant autorité et **remplace** le texte de la bulle de l'assistant — aucune modification de l'interface n'a été nécessaire.

**Pourquoi un instantané :** Le parser SSE du frontend utilise `fullText` quand il est présent ; remplacer l'intégralité du message de l'assistant est O(1) pour l'interface et correspond mentalement à "modifier le corps du message".

**Pourquoi séparer les chemins LLM et callback :** Le streaming LLM est véritablement incrémental (append). La progression des actions est un **remplacement d'état** (le dernier statut l'emporte). Mélanger les deux à travers une seule fonction de fusion brouillait ces sémantiques.

---

<div id="plugin-contract-unchanged">
## Contrat des plugins (inchangé)
</div>

Les plugins doivent continuer à utiliser la forme `HandlerCallback` d'**elizaOS** :

```typescript
await callback({ text: "🔍 Searching…", source: message.content.source });
await callback({ text: "Now playing: **Track**", source: message.content.source });
```

Pas de champs supplémentaires, pas d'APIs spécifiques à Milady, pas d'attachement au runtime. Les helpers comme `ProgressiveMessage` dans `plugin-music-player` restent un simple wrapper autour de `callback`.

**Pourquoi préserver le contrat :** Discord et d'autres connecteurs dépendent déjà de cette API ; le rôle de Milady est d'interpréter correctement les callbacks répétés dans le chemin du **chat API**, pas de forker la surface du plugin.

---

<div id="where-it-applies">
## Où cela s'applique
</div>

`replaceCallbackText` est câblé pour :

- Le callback d'action principal de `messageService.handleMessage`.
- `executeFallbackParsedActions` (récupération d'actions parsées).
- Le dispatch direct de compétences Binance (`maybeHandleDirectBinanceSkillRequest`).
- Le repli d'exécution de portefeuille et les chemins similaires qui invoquent des actions avec des callbacks.

**Non** utilisé pour `onStreamChunk` — celui-ci reste en append uniquement.

---

<div id="related-code-and-docs">
## Code et documentation associés
</div>

- **Implémentation :** `packages/agent/src/api/chat-routes.ts` — `replaceCallbackText`, `preCallbackText`.
- **Helper d'exemple :** `packages/plugin-music-player/src/utils/progressiveMessage.ts`.
- **Streaming de l'interface :** [Tableau de bord — Chat](/fr/dashboard/chat) (SSE / indicateur de saisie).
- **Journal des modifications :** [Journal des modifications](/fr/changelog) — recherchez "action callback" ou la date de publication.

---

<div id="future--roadmap">
## Futur / feuille de route
</div>

Suivis possibles (non livrés comme exigences ici) :

- **Métadonnées** optionnelles sur le contenu du callback pour distinguer "append" et "replace" pour les plugins exotiques (uniquement si un cas d'usage réel apparaît).
- **Persistance** des statuts intermédiaires (aujourd'hui le texte du tour final persisté suit les règles normales de persistance du chat).

Consultez `docs/ROADMAP.md` dans le dépôt pour la direction générale du produit.
