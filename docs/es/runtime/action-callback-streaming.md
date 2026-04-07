---
title: Callbacks de acciones y streaming SSE
description: Por qué Milady reemplaza (en lugar de concatenar) el texto de callbacks de acciones en el chat del panel, y cómo coincide con los mensajes progresivos al estilo de Discord.
---

<div id="action-callbacks-and-sse-streaming">
# Callbacks de acciones y streaming SSE
</div>

El chat del panel de Milady usa **Server-Sent Events (SSE)** para transmitir la respuesta del asistente. Dos tipos diferentes de texto llegan por el mismo flujo:

1. **Tokens LLM** — la respuesta transmitida del modelo (`onStreamChunk`).
2. **Callbacks de acciones** — texto devuelto por `HandlerCallback` mientras se ejecuta una acción (p. ej. `PLAY_AUDIO`, flujos de billetera, respaldos de habilidades de Binance).

Esta página explica **cómo se combinan** y **por qué** ese diseño coincide con plataformas como Discord y Telegram.

---

<div id="the-problem-we-solved">
## El problema que resolvimos
</div>

En **Discord**, `@elizaos/plugin-discord` usa un **mensaje progresivo**: se crea un mensaje en el canal, y luego se **edita en su lugar** a medida que llegan actualizaciones de estado ("Buscando pista…", "Buscando…", "Reproduciendo: …").

En la **web**, cada `callback({ text })` se procesaba anteriormente a través de la misma ruta de combinación que los fragmentos transmitidos arbitrarios. Las cadenas de estado no relacionadas no comparten un prefijo entre sí, por lo que la heurística de combinación a menudo las **concatenaba**:

```text
🔍 Looking up track...🔍 Searching for track...✨ Setting up playback...Now playing: **Song**
```

Eso es correcto para **deltas de tokens** que extienden la misma respuesta, pero incorrecto para **estados sucesivos** que deberían **reemplazar** el estado anterior.

**Por qué importa:** Los usuarios esperan **actualizaciones en vivo y en su lugar** (tiempo real al estilo web2), no una pila creciente de fragmentos de estado. Los plugins no deberían necesitar un segundo transporte (WebSocket, eventos personalizados) solo para alcanzar la paridad con Discord.

---

<div id="the-milady-behavior">
## El comportamiento de Milady
</div>

Dentro de `generateChatResponse` (`packages/agent/src/api/chat-routes.ts`):

- Los **fragmentos LLM** siguen usando semántica de **append** mediante `appendIncomingText` → `resolveStreamingUpdate` → `onChunk`.
- Los **callbacks de acciones** usan **`replaceCallbackText`**:
  - En el **primer** callback de un turno, el servidor toma una instantánea de lo que ya se transmitió (`preCallbackText` — generalmente el texto parcial o final del LLM).
  - Cada callback **posterior** establece la respuesta visible como:

    `preCallbackText + "\n\n" + latestCallbackText`

  - Así que el **segmento de callback** se **reemplaza** cada vez; el prefijo del LLM se preserva.

La capa HTTP emite una **instantánea** (`onSnapshot`) de modo que el evento SSE lleva el nuevo `fullText` **completo**. El cliente ya trata `fullText` como autoritativo y **reemplaza** el texto de la burbuja del asistente — no se requirió ningún cambio en la interfaz.

**Por qué instantánea:** El parser SSE del frontend usa `fullText` cuando está presente; reemplazar todo el mensaje del asistente es O(1) para la interfaz y coincide mentalmente con "editar el cuerpo del mensaje".

**Por qué separar las rutas LLM vs callback:** El streaming LLM es genuinamente incremental (append). El progreso de acciones es **reemplazo de estado** (el último estado gana). Mezclar ambos a través de una función de combinación difuminaba esas semánticas.

---

<div id="plugin-contract-unchanged">
## Contrato de plugins (sin cambios)
</div>

Los plugins deben seguir usando la forma `HandlerCallback` de **elizaOS**:

```typescript
await callback({ text: "🔍 Searching…", source: message.content.source });
await callback({ text: "Now playing: **Track**", source: message.content.source });
```

Sin campos adicionales, sin APIs específicas de Milady, sin adjuntos al runtime. Helpers como `ProgressiveMessage` en `plugin-music-player` siguen siendo un envoltorio ligero sobre `callback`.

**Por qué preservar el contrato:** Discord y otros conectores ya dependen de esta API; el trabajo de Milady es interpretar correctamente los callbacks repetidos en la ruta de **chat de la API**, no bifurcar la superficie del plugin.

---

<div id="where-it-applies">
## Dónde se aplica
</div>

`replaceCallbackText` está conectado para:

- El callback de acción principal de `messageService.handleMessage`.
- `executeFallbackParsedActions` (recuperación de acciones parseadas).
- Despacho directo de habilidades de Binance (`maybeHandleDirectBinanceSkillRequest`).
- Respaldo de ejecución de billetera y rutas similares que invocan acciones con callbacks.

**No** se usa para `onStreamChunk` — ese permanece solo con append.

---

<div id="related-code-and-docs">
## Código y documentación relacionados
</div>

- **Implementación:** `packages/agent/src/api/chat-routes.ts` — `replaceCallbackText`, `preCallbackText`.
- **Helper de ejemplo:** `packages/plugin-music-player/src/utils/progressiveMessage.ts`.
- **Streaming en la interfaz:** [Panel de control — Chat](/es/dashboard/chat) (SSE / indicador de escritura).
- **Registro de cambios:** [Registro de cambios](/es/changelog) — busca "action callback" o la fecha de lanzamiento.

---

<div id="future--roadmap">
## Futuro / hoja de ruta
</div>

Posibles seguimientos (no implementados como requisitos aquí):

- **Metadatos** opcionales en el contenido del callback para distinguir "append" vs "replace" para plugins exóticos (solo si aparece un caso de uso real).
- **Persistencia** de estados intermedios (hoy el texto del turno final persistido sigue las reglas normales de persistencia del chat).

Consulta `docs/ROADMAP.md` en el repositorio para la dirección general del producto.
