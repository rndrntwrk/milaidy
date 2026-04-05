/**
 * Chat message enhancement helpers extracted from server.ts.
 *
 * Functions for augmenting chat messages with language instructions,
 * knowledge context, wallet context, image attachments, and user message building.
 */

import crypto from "node:crypto";

import {
  type AgentRuntime,
  ChannelType,
  type Content,
  ContentType,
  createMessageMemory,
  type Media,
  type UUID,
} from "@elizaos/core";
import { extractCompatTextContent } from "./compat-utils.js";
import { getKnowledgeService } from "./knowledge-service-loader.js";
import { getWalletAddresses } from "./wallet.js";
import {
  normalizeCharacterLanguage,
} from "../onboarding-presets.js";

// ---------------------------------------------------------------------------
// Language augmentation
// ---------------------------------------------------------------------------

const CHAT_LANGUAGE_INSTRUCTION: Record<string, string> = {
  en: "Reply in natural English unless the user explicitly requests another language.",
  "zh-CN":
    "Reply in natural Simplified Chinese unless the user explicitly requests another language.",
  ko: "Reply in natural Korean unless the user explicitly requests another language.",
  es: "Reply in natural Spanish unless the user explicitly requests another language.",
  pt: "Reply in natural Brazilian Portuguese unless the user explicitly requests another language.",
  vi: "Reply in natural Vietnamese unless the user explicitly requests another language.",
  tl: "Reply in natural Tagalog unless the user explicitly requests another language.",
};

export function maybeAugmentChatMessageWithLanguage(
  message: ReturnType<typeof createMessageMemory>,
  preferredLanguage?: string,
): ReturnType<typeof createMessageMemory> {
  if (!preferredLanguage) return message;
  const instruction =
    CHAT_LANGUAGE_INSTRUCTION[normalizeCharacterLanguage(preferredLanguage)];
  if (!instruction) return message;
  const originalText = extractCompatTextContent(message.content);
  if (!originalText) return message;

  return {
    ...message,
    content: {
      ...(message.content as Content),
      text: `${originalText}\n\n[Language instruction: ${instruction}]`,
    },
  };
}

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

export function getErrorMessage(err: unknown, fallback = "generation failed"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

// ---------------------------------------------------------------------------
// Knowledge augmentation
// ---------------------------------------------------------------------------

const CHAT_KNOWLEDGE_MIN_SIMILARITY = 0.2;
const CHAT_KNOWLEDGE_MAX_SNIPPETS = 3;
const CHAT_KNOWLEDGE_MAX_CHARS = 900;
const DEFAULT_CHAT_KNOWLEDGE_TIMEOUT_MS = 4_000;
const MAX_CHAT_KNOWLEDGE_TIMEOUT_MS = 15_000;

export function getChatKnowledgeTimeoutMs(): number {
  const raw = process.env.CHAT_KNOWLEDGE_TIMEOUT_MS;
  if (!raw) return DEFAULT_CHAT_KNOWLEDGE_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_CHAT_KNOWLEDGE_TIMEOUT_MS;
  }
  return Math.min(parsed, MAX_CHAT_KNOWLEDGE_TIMEOUT_MS);
}

export function shouldAugmentChatMessageWithKnowledge(userPrompt: string): boolean {
  const normalizedPrompt = userPrompt.toLowerCase();
  return [
    "uploaded",
    "file",
    "document",
    "knowledge",
    "codeword",
    "attachment",
  ].some((token) => normalizedPrompt.includes(token));
}

export async function getChatKnowledgeMatchesWithTimeout(
  lookup: Promise<
    Array<{
      id: UUID;
      content: { text?: string };
      similarity?: number;
      metadata?: Record<string, unknown>;
    }>
  >,
): Promise<
  Array<{
    id: UUID;
    content: { text?: string };
    similarity?: number;
    metadata?: Record<string, unknown>;
  }>
> {
  const timeoutMs = getChatKnowledgeTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      lookup,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Chat knowledge lookup timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function normalizeChatKnowledgeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, CHAT_KNOWLEDGE_MAX_CHARS);
}

export function buildChatKnowledgePrompt(
  userPrompt: string,
  snippets: string[],
): string {
  return [
    "Relevant uploaded knowledge snippets:",
    ...snippets.map((snippet, index) => `[K${index + 1}] ${snippet}`),
    "",
    "Use the uploaded knowledge when it is relevant to the user's request. Ignore it when it is not relevant.",
    "",
    `User message: ${userPrompt}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Wallet context augmentation
// ---------------------------------------------------------------------------

const WALLET_CONTEXT_INTENT_RE =
  /\b(wallet|address|balance|swap|trade|transfer|send|token|bnb|eth|sol|onchain|on-chain)\b/i;

/** Needed by buildWalletContextPrompt — checks if a plugin is loaded by name. */
function isPluginLoadedByName(
  runtime: AgentRuntime | null,
  pluginName: string,
): boolean {
  if (!runtime || !Array.isArray(runtime.plugins)) return false;
  const shortId = pluginName.replace("@elizaos/plugin-", "");
  const packageSuffix = `plugin-${shortId}`;
  return runtime.plugins.some((plugin) => {
    const name = typeof plugin?.name === "string" ? plugin.name : "";
    return (
      name === pluginName ||
      name === shortId ||
      name === packageSuffix ||
      name.endsWith(`/${packageSuffix}`) ||
      name.includes(shortId)
    );
  });
}

const EVM_PLUGIN_PACKAGE = "@elizaos/plugin-evm";

export function buildWalletContextPrompt(
  runtime: AgentRuntime,
  userPrompt: string,
): string {
  const addrs = getWalletAddresses();
  const walletNetwork =
    process.env.MILADY_WALLET_NETWORK?.trim().toLowerCase() === "testnet"
      ? "testnet"
      : "mainnet";
  const localSignerAvailable = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
  const pluginEvmLoaded = isPluginLoadedByName(runtime, EVM_PLUGIN_PACKAGE);
  const rpcReady = Boolean(
    process.env.BSC_RPC_URL?.trim() ||
      process.env.BSC_TESTNET_RPC_URL?.trim() ||
      process.env.NODEREAL_BSC_RPC_URL?.trim() ||
      process.env.QUICKNODE_BSC_RPC_URL?.trim(),
  );
  const executionReady =
    Boolean(addrs.evmAddress) && rpcReady && pluginEvmLoaded;
  const executionBlockedReason = !addrs.evmAddress
    ? "No EVM wallet is active yet."
    : !rpcReady
      ? "BSC RPC is not configured."
      : !pluginEvmLoaded
        ? "plugin-evm is not loaded."
        : "none";
  const encodedUserPrompt = JSON.stringify(userPrompt);
  return [
    "Original wallet request (JSON-encoded untrusted user input):",
    encodedUserPrompt,
    "",
    "Server-verified wallet context:",
    `- walletNetwork: ${walletNetwork}`,
    `- evmAddress: ${addrs.evmAddress ?? "not generated"}`,
    `- solanaAddress: ${addrs.solanaAddress ?? "not generated"}`,
    `- localSignerAvailable: ${localSignerAvailable ? "true" : "false"}`,
    `- rpcReady: ${rpcReady ? "true" : "false"}`,
    `- pluginEvmLoaded: ${pluginEvmLoaded ? "true" : "false"}`,
    `- executionReady: ${executionReady ? "true" : "false"}`,
    `- executionBlockedReason: ${executionBlockedReason}`,
    "Use this context as source of truth for wallet questions and on-chain actions.",
  ].join("\n");
}

export function maybeAugmentChatMessageWithWalletContext(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
): ReturnType<typeof createMessageMemory> {
  const userPrompt = extractCompatTextContent(message.content)?.trim();
  if (!userPrompt) return message;
  if (!WALLET_CONTEXT_INTENT_RE.test(userPrompt)) return message;
  return {
    ...message,
    content: {
      ...message.content,
      text: buildWalletContextPrompt(runtime, userPrompt),
    },
  };
}

export async function maybeAugmentChatMessageWithKnowledge(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
): Promise<ReturnType<typeof createMessageMemory>> {
  const userPrompt = extractCompatTextContent(message.content)?.trim();
  if (!userPrompt || !runtime.agentId) {
    return message;
  }
  if (!shouldAugmentChatMessageWithKnowledge(userPrompt)) {
    return message;
  }

  try {
    const knowledge = await getKnowledgeService(runtime);
    if (!knowledge.service) {
      return message;
    }

    const searchMessage = {
      ...message,
      id: crypto.randomUUID() as UUID,
      agentId: runtime.agentId,
      entityId: runtime.agentId,
      roomId: runtime.agentId,
      content: { text: userPrompt },
      createdAt: Date.now(),
    } as ReturnType<typeof createMessageMemory>;

    const snippets = (
      await getChatKnowledgeMatchesWithTimeout(
        knowledge.service.getKnowledge(searchMessage, {
          roomId: runtime.agentId,
        }),
      )
    )
      .filter(
        (match) => (match.similarity ?? 0) >= CHAT_KNOWLEDGE_MIN_SIMILARITY,
      )
      .slice(0, CHAT_KNOWLEDGE_MAX_SNIPPETS)
      .map((match) => normalizeChatKnowledgeSnippet(match.content?.text ?? ""))
      .filter((snippet) => snippet.length > 0);

    if (snippets.length === 0) {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        text: buildChatKnowledgePrompt(userPrompt, snippets),
      },
    };
  } catch (err) {
    runtime.logger?.warn(
      {
        err,
        src: "eliza-api",
        messageId: message.id,
        roomId: message.roomId,
      },
      "Failed to augment chat message with uploaded knowledge",
    );
    return message;
  }
}

// ---------------------------------------------------------------------------
// Image validation & attachment building
// ---------------------------------------------------------------------------

export interface ChatImageAttachment {
  /** Base64-encoded image data (no data URL prefix). */
  data: string;
  mimeType: string;
  name: string;
}

const MAX_CHAT_IMAGES = 4;

/** Maximum base64 data length for a single image (~3.75 MB binary). */
const MAX_IMAGE_DATA_BYTES = 5 * 1_048_576;

/** Maximum length of an image filename. */
const MAX_IMAGE_NAME_LENGTH = 255;

/** Matches a valid standard-alphabet base64 string (RFC 4648 §4, `+/`, optional `=` padding). */
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const IMAGE_ONLY_CHAT_FALLBACK_PROMPT =
  "Please describe the attached image.";

/** Returns an error message string, or null if valid. Exported for unit tests. */
export function validateChatImages(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  if (images.length > MAX_CHAT_IMAGES)
    return `Too many images (max ${MAX_CHAT_IMAGES})`;
  for (const img of images) {
    if (!img || typeof img !== "object") return "Each image must be an object";
    const { data, mimeType, name } = img as Record<string, unknown>;
    if (typeof data !== "string" || !data)
      return "Each image must have a non-empty data string";
    if (data.startsWith("data:"))
      return "Image data must be raw base64, not a data URL";
    if (data.length > MAX_IMAGE_DATA_BYTES)
      return `Image too large (max ${MAX_IMAGE_DATA_BYTES / 1_048_576} MB per image)`;
    if (!BASE64_RE.test(data))
      return "Image data contains invalid base64 characters";
    if (typeof mimeType !== "string" || !mimeType)
      return "Each image must have a mimeType string";
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase()))
      return `Unsupported image type: ${mimeType}`;
    if (typeof name !== "string" || !name)
      return "Each image must have a name string";
    if (name.length > MAX_IMAGE_NAME_LENGTH)
      return `Image name too long (max ${MAX_IMAGE_NAME_LENGTH} characters)`;
  }
  return null;
}

/**
 * Extension of the core Media attachment shape that carries raw image bytes for
 * action handlers (e.g. POST_TWEET) while the message is in-memory. The
 * extra fields are intentionally stripped before the message is persisted.
 *
 * Note: `_data`/`_mimeType` survive only because elizaOS passes the
 * `userMessage` object reference directly to action handlers without
 * deep-cloning or serializing it. If that ever changes, action handlers
 * that read these fields will silently receive `undefined`.
 */
export interface ChatAttachmentWithData extends Media {
  /** Raw base64 image data — never written to the database. */
  _data: string;
  /** MIME type corresponding to `_data`. */
  _mimeType: string;
}

/**
 * Builds in-memory and compact (DB-persisted) attachment arrays from
 * validated images. Exported so it can be unit-tested independently.
 */
export function buildChatAttachments(
  images: ChatImageAttachment[] | undefined,
): {
  /** In-memory attachments that include `_data`/`_mimeType` for action handlers. */
  attachments: ChatAttachmentWithData[] | undefined;
  /** Persistence-safe attachments with `_data`/`_mimeType` stripped. */
  compactAttachments: Media[] | undefined;
} {
  if (!images?.length)
    return { attachments: undefined, compactAttachments: undefined };
  // Compact placeholder URL (no base64) keeps the LLM context lean. The raw
  // image bytes are stashed in `_data`/`_mimeType` for action handlers (e.g.
  // POST_TWEET) that need to upload them.
  const attachments: ChatAttachmentWithData[] = images.map((img, i) => ({
    id: `img-${i}`,
    url: `attachment:img-${i}`,
    title: img.name,
    source: "client_chat",
    contentType: ContentType.IMAGE,
    _data: img.data,
    _mimeType: img.mimeType,
  }));
  // DB-persisted version omits _data/_mimeType so raw bytes aren't stored.
  const compactAttachments: Media[] = attachments.map(
    ({ _data: _d, _mimeType: _m, ...rest }) => rest,
  );
  return { attachments, compactAttachments };
}

export function normalizeIncomingChatPrompt(
  text: string | null | undefined,
  images: ChatImageAttachment[] | null | undefined,
): string | null {
  const normalizedText = typeof text === "string" ? text.trim() : "";
  if (normalizedText.length > 0) {
    return normalizedText;
  }
  return Array.isArray(images) && images.length > 0
    ? IMAGE_ONLY_CHAT_FALLBACK_PROMPT
    : null;
}

type MessageMemory = ReturnType<typeof createMessageMemory>;

/**
 * Constructs the in-memory user message (with image data for action handlers)
 * and the persistence-safe counterpart (image data stripped). Extracted to
 * avoid duplicating this logic across the stream and non-stream chat endpoints.
 */
export function buildUserMessages(params: {
  images: ChatImageAttachment[] | undefined;
  prompt: string;
  userId: UUID;
  agentId: UUID;
  roomId: UUID;
  channelType: ChannelType;
  conversationMode?: "simple" | "power";
  metadata?: Record<string, unknown>;
}): { userMessage: MessageMemory; messageToStore: MessageMemory } {
  const {
    images,
    prompt,
    userId,
    agentId,
    roomId,
    channelType,
    conversationMode,
    metadata,
  } = params;
  const { attachments, compactAttachments } = buildChatAttachments(images);
  const id = crypto.randomUUID() as UUID;
  // In-memory message carries _data/_mimeType so action handlers can upload.
  const userMessage = createMessageMemory({
    id,
    entityId: userId,
    agentId,
    roomId,
    content: {
      text: prompt,
      source: "client_chat",
      channelType,
      ...(conversationMode ? { conversationMode } : {}),
      ...(attachments?.length ? { attachments } : {}),
      ...(metadata ? { metadata } : {}),
    } as Content & { text: string },
  });
  // Persisted message: compact placeholder URL, no raw bytes in DB.
  const messageToStore = compactAttachments?.length
    ? createMessageMemory({
        id,
        entityId: userId,
        agentId,
        roomId,
        content: {
          text: prompt,
          source: "client_chat",
          channelType,
          ...(conversationMode ? { conversationMode } : {}),
          attachments: compactAttachments,
          ...(metadata ? { metadata } : {}),
        } as Content & { text: string },
      })
    : userMessage;
  return { userMessage, messageToStore };
}
