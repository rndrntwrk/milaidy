// Vitest-only stub for @elizaos/plugin-telegram.
//
// The upstream package currently publishes only package.json (no dist/), which
// breaks Vite/Vitest resolution. In production, the plugin manager tolerates a
// failed optional plugin; in tests we just need a stable module surface.

export default {
  name: "telegram",
  description: "Vitest stub for @elizaos/plugin-telegram",
  actions: [],
  services: [],
  providers: [],
  evaluators: [],
};

export function markdownToTelegramChunks(text, maxChars = 4096) {
  const input = (text ?? "").toString();
  if (!input.trim()) return [];
  const chunks = [];
  for (let i = 0; i < input.length; i += maxChars) {
    const slice = input.slice(i, i + maxChars);
    chunks.push({ html: slice, text: slice });
  }
  return chunks;
}

export class MessageManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_bot, _runtime) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleMessage(_ctx) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendMessageInChunks(_ctx, _content, _replyToMessageId) {
    return [];
  }
}

export class TelegramService {
  static serviceType = "TELEGRAM";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async start(_runtime) {
    return { bot: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async stop(_runtime) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_runtime) {}
}

