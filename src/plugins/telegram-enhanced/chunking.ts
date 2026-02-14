import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const DEFAULT_HEADROOM = 120;

export type TelegramChunk = {
  html: string;
  text: string;
};

type MarkdownToTelegramChunk = (
  markdown: string,
  maxChars: number,
) => Array<{ html?: string; text?: string }>;

function fallbackMarkdownToTelegramChunks(
  markdown: string,
  maxChars: number,
): TelegramChunk[] {
  const trimmed = (markdown ?? "").trim();
  if (!trimmed) return [];

  const chunks: TelegramChunk[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars) {
    const segment = trimmed.slice(i, i + maxChars);
    chunks.push({ html: segment, text: segment });
  }

  return chunks;
}

function loadMarkdownChunker(): MarkdownToTelegramChunk {
  const require = createRequire(fileURLToPath(import.meta.url));
  try {
    const plugin = require("@elizaos/plugin-telegram") as {
      markdownToTelegramChunks?: MarkdownToTelegramChunk;
    };
    if (typeof plugin.markdownToTelegramChunks === "function") {
      return plugin.markdownToTelegramChunks;
    }
  } catch {
    // package is optional in environments without @elizaos/plugin-telegram
  }

  return fallbackMarkdownToTelegramChunks;
}

const markdownToTelegramChunks = loadMarkdownChunker();

export function smartChunkTelegramText(
  markdown: string,
  maxChars: number = TELEGRAM_MESSAGE_LIMIT - DEFAULT_HEADROOM,
): TelegramChunk[] {
  const safeText = (markdown ?? "").trim();
  if (!safeText) return [];

  const chunks = markdownToTelegramChunks(safeText, maxChars);
  if (Array.isArray(chunks) && chunks.length > 0) {
    return chunks.map((chunk: { html?: string; text?: string }) => ({
      html: chunk.html ?? "",
      text: chunk.text ?? "",
    }));
  }

  return [{ html: safeText, text: safeText }];
}
