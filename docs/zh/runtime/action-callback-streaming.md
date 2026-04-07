---
title: 动作回调与 SSE 流式传输
description: 为什么 Milady 在仪表盘聊天中替换（而非拼接）动作回调文本，以及这如何匹配 Discord 风格的渐进式消息。
---

<div id="action-callbacks-and-sse-streaming">
# 动作回调与 SSE 流式传输
</div>

Milady 的仪表盘聊天使用 **Server-Sent Events (SSE)** 来流式传输助手回复。两种不同类型的文本通过同一个流到达：

1. **LLM 令牌** — 模型的流式回复（`onStreamChunk`）。
2. **动作回调** — 在动作运行时由 `HandlerCallback` 返回的文本（例如 `PLAY_AUDIO`、钱包流程、Binance 技能回退）。

本页说明了**它们是如何合并的**以及**为什么**这种设计与 Discord 和 Telegram 等平台一致。

---

<div id="the-problem-we-solved">
## 我们解决的问题
</div>

在 **Discord** 上，`@elizaos/plugin-discord` 使用**渐进式消息**：创建一条频道消息，然后随着状态更新到达而**就地编辑**（"查找曲目…"、"搜索中…"、"正在播放：…"）。

在**网页端**，每个 `callback({ text })` 之前都通过与任意流式片段相同的合并路径处理。不相关的状态字符串彼此没有共同前缀，因此合并启发式算法经常将它们**拼接**在一起：

```text
🔍 Looking up track...🔍 Searching for track...✨ Setting up playback...Now playing: **Song**
```

这对于扩展同一回答的**令牌增量**是正确的，但对于应该**替换**前一状态的**连续状态**来说是错误的。

**为什么重要：** 用户期望**实时就地更新**（web2 风格的实时体验），而不是不断增长的状态片段堆。插件不应该仅仅为了达到与 Discord 的一致性就需要第二个传输通道（WebSocket、自定义事件）。

---

<div id="the-milady-behavior">
## Milady 的行为
</div>

在 `generateChatResponse`（`packages/agent/src/api/chat-routes.ts`）内部：

- **LLM 片段**仍然通过 `appendIncomingText` → `resolveStreamingUpdate` → `onChunk` 使用 **append** 语义。
- **动作回调**使用 **`replaceCallbackText`**：
  - 在一个回合中的**第一个**回调时，服务器对已经流式传输的内容做快照（`preCallbackText` — 通常是 LLM 的部分或完整文本）。
  - 每个**后续**回调将可见回复设置为：

    `preCallbackText + "\n\n" + latestCallbackText`

  - 因此**回调段**每次都被**替换**；LLM 前缀被保留。

HTTP 层发出一个**快照**（`onSnapshot`），使 SSE 事件携带**完整的**新 `fullText`。客户端已经将 `fullText` 视为权威并**替换**助手气泡的文本 — 不需要任何界面更改。

**为什么使用快照：** 前端的 SSE 解析器在 `fullText` 存在时使用它；替换整个助手消息对界面来说是 O(1) 的操作，且在心理模型上与"编辑消息正文"一致。

**为什么分离 LLM 与回调路径：** LLM 流式传输是真正增量的（append）。动作进度是**状态替换**（最新状态胜出）。将两者混合通过一个合并函数模糊了这些语义。

---

<div id="plugin-contract-unchanged">
## 插件契约（未更改）
</div>

插件应继续使用 **elizaOS** 的 `HandlerCallback` 形式：

```typescript
await callback({ text: "🔍 Searching…", source: message.content.source });
await callback({ text: "Now playing: **Track**", source: message.content.source });
```

无额外字段，无 Milady 特定的 API，无运行时附件。`plugin-music-player` 中的 `ProgressiveMessage` 等辅助工具仍然只是对 `callback` 的轻量包装。

**为什么保留契约：** Discord 和其他连接器已经依赖此 API；Milady 的职责是在 **API 聊天**路径中正确解释重复的回调，而不是分叉插件接口。

---

<div id="where-it-applies">
## 适用范围
</div>

`replaceCallbackText` 已连接用于：

- `messageService.handleMessage` 的主要动作回调。
- `executeFallbackParsedActions`（解析动作恢复）。
- Binance 技能直接分发（`maybeHandleDirectBinanceSkillRequest`）。
- 钱包执行回退及其他使用回调调用动作的类似路径。

**不**用于 `onStreamChunk` — 它保持仅 append 模式。

---

<div id="related-code-and-docs">
## 相关代码和文档
</div>

- **实现：** `packages/agent/src/api/chat-routes.ts` — `replaceCallbackText`、`preCallbackText`。
- **示例辅助工具：** `packages/plugin-music-player/src/utils/progressiveMessage.ts`。
- **界面流式传输：** [仪表盘 — 聊天](/zh/dashboard/chat)（SSE / 输入指示器）。
- **更新日志：** [更新日志](/zh/changelog) — 搜索 "action callback" 或发布日期。

---

<div id="future--roadmap">
## 未来 / 路线图
</div>

可能的后续工作（此处未作为需求交付）：

- 回调内容上的可选**元数据**，用于区分 "append" 与 "replace"，供特殊插件使用（仅在出现真实用例时）。
- 中间状态的**持久化**（目前最终持久化的回合文本遵循正常的聊天持久化规则）。

请参阅仓库中的 `docs/ROADMAP.md` 了解产品的总体方向。
