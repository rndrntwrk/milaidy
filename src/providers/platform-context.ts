/**
 * Platform context injection provider.
 *
 * Detects the current platform from room metadata and injects
 * platform-specific capabilities, formatting rules, and behavioral
 * constraints into the agent context.
 *
 * This prevents cross-platform confusion (e.g., telling a Discord user
 * to "click the button on the web interface").
 *
 * @module providers/platform-context
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

// ---------- Types ----------

export type PlatformId = "discord" | "telegram" | "web_chat" | "unknown";

export interface PlatformCapabilities {
  /** Platform identifier. */
  platform: PlatformId;
  /** Human-readable platform name. */
  displayName: string;
  /** Supported formatting features. */
  formatting: string[];
  /** Features available on this platform. */
  features: string[];
  /** Features NOT available — important for preventing confabulation. */
  unavailable: string[];
  /** Platform-specific behavioral rules. */
  rules: string[];
}

// ---------- Platform Definitions ----------

const PLATFORM_CAPABILITIES: Record<PlatformId, PlatformCapabilities> = {
  discord: {
    platform: "discord",
    displayName: "Discord",
    formatting: [
      "Discord-flavored markdown (bold, italic, code blocks, spoilers)",
      "Embeds with rich formatting (titles, descriptions, fields, thumbnails)",
    ],
    features: [
      "Reactions and emoji responses",
      "Thread support for long conversations",
      "Voice channel awareness (no voice generation)",
      "Multiple channels and servers",
      "User identity tied to Discord account",
    ],
    unavailable: [
      "Full markdown rendering (no headers, no tables, no horizontal rules)",
      "Inline keyboards",
      "HTML formatting",
    ],
    rules: [
      "Never tell a Discord user to 'click the button on the web interface'.",
      "Never reference web-chat-only features like full markdown tables.",
      "Use Discord-flavored markdown for formatting.",
      "Keep embeds concise — Discord truncates long embed fields.",
    ],
  },

  telegram: {
    platform: "telegram",
    displayName: "Telegram",
    formatting: [
      "HTML subset formatting (bold, italic, code, links)",
      "Inline keyboards for interactive responses",
    ],
    features: [
      "Sticker support",
      "Reply-to threading",
      "User identity tied to Telegram account",
    ],
    unavailable: [
      "Full markdown rendering",
      "Discord-style embeds",
      "Thread support (use reply-to instead)",
      "Reactions (limited)",
    ],
    rules: [
      "Never tell a Telegram user to 'check the thread' — Telegram uses reply-to, not threads.",
      "Never reference Discord-specific features like embeds or reactions.",
      "Use HTML formatting, not markdown.",
      "Keep messages concise — Telegram has a 4096 character limit per message.",
    ],
  },

  web_chat: {
    platform: "web_chat",
    displayName: "Web Chat",
    formatting: [
      "Full markdown rendering (headers, bold, italic, code blocks, tables, links)",
    ],
    features: [
      "Single conversation per session",
      "Admin entity is the default user identity",
      "Rich UI components (UiSpec JSON)",
      "Plugin configuration forms ([CONFIG:pluginId])",
    ],
    unavailable: [
      "Reactions and emoji responses",
      "Embeds",
      "Threads",
      "Voice capabilities",
      "Multiple channels",
    ],
    rules: [
      "Never tell a web chat user to 'react with an emoji' — web chat has no reactions.",
      "Never reference Discord or Telegram-specific features.",
      "Use full markdown for structured responses — tables, headers, and code blocks render well here.",
    ],
  },

  unknown: {
    platform: "unknown",
    displayName: "Unknown Platform",
    formatting: ["Plain text (safe fallback)"],
    features: [],
    unavailable: [],
    rules: [
      "Platform could not be detected. Use plain text formatting only.",
      "Do not assume any platform-specific capabilities.",
      "If the user asks about platform features, ask them which platform they are on.",
    ],
  },
};

// ---------- Platform Detection ----------

/**
 * Detect the platform from room source and metadata.
 *
 * Priority:
 * 1. Explicit metadata.platform on the message
 * 2. room.source field (set by ElizaOS platform plugins)
 * 3. Room ID pattern heuristics
 * 4. Fallback to "unknown"
 */
export function detectPlatform(
  roomSource?: string | null,
  roomId?: string | null,
  messageMeta?: Record<string, unknown> | null,
): PlatformId {
  // 1. Explicit metadata override
  const explicitPlatform = messageMeta?.platform as string | undefined;
  if (explicitPlatform) {
    const normalized = normalizePlatformId(explicitPlatform);
    if (normalized !== "unknown") return normalized;
  }

  // 2. Room source (most reliable)
  if (roomSource) {
    const normalized = normalizePlatformId(roomSource);
    if (normalized !== "unknown") return normalized;
  }

  // 3. Room ID pattern heuristics
  if (roomId) {
    if (roomId.includes("web-conv") || roomId.includes("web-chat")) {
      return "web_chat";
    }
  }

  return "unknown";
}

function normalizePlatformId(source: string): PlatformId {
  const lower = source.trim().toLowerCase();
  if (lower === "discord" || lower.includes("discord")) return "discord";
  if (lower === "telegram" || lower.includes("telegram")) return "telegram";
  if (
    lower === "web_chat" ||
    lower === "webchat" ||
    lower === "web" ||
    lower === "client_chat" ||
    lower.includes("web_chat") ||
    lower.includes("webchat")
  ) {
    return "web_chat";
  }
  return "unknown";
}

// ---------- Context Formatting ----------

/**
 * Format platform capabilities into a context string for injection
 * into the agent's system prompt via the provider pipeline.
 */
export function formatPlatformContext(caps: PlatformCapabilities): string {
  const lines: string[] = [
    `## Current Platform: ${caps.displayName}`,
    "",
    "### Formatting",
    ...caps.formatting.map((f) => `- ${f}`),
    "",
    "### Available Features",
    ...(caps.features.length > 0
      ? caps.features.map((f) => `- ${f}`)
      : ["- No platform-specific features detected"]),
  ];

  if (caps.unavailable.length > 0) {
    lines.push("", "### NOT Available on This Platform");
    lines.push(...caps.unavailable.map((f) => `- ${f}`));
  }

  if (caps.rules.length > 0) {
    lines.push("", "### Platform Rules");
    lines.push(...caps.rules.map((r) => `- ${r}`));
  }

  lines.push(
    "",
    "### Cross-Platform Awareness",
    "- Your knowledge corpus is the same across all platforms — agent-scoped, not platform-scoped.",
    "- Conversation history is room-scoped. Do not claim to remember conversations from other platforms unless explicitly told.",
    '- If a user references a conversation from another platform, say: "I don\'t have access to that conversation history in this session. Can you remind me of the key points?"',
    "- When referencing actions on another platform, be explicit: \"On Discord, you can...\" or \"If you switch to web chat, you'll be able to...\"",
  );

  return lines.join("\n");
}

// ---------- Provider ----------

export function getPlatformCapabilities(
  platform: PlatformId,
): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[platform];
}

export function createPlatformContextProvider(): Provider {
  return {
    name: "milaidyPlatformContext",
    description:
      "Injects platform-specific capabilities and behavioral rules based on the current conversation platform.",
    dynamic: true,
    position: 10,

    async get(
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const meta = (message.metadata ?? {}) as Record<string, unknown>;

      let roomSource: string | null = null;
      let roomIdStr: string | null = message.roomId ?? null;

      try {
        const room = await runtime.getRoom(message.roomId);
        if (room) {
          roomSource = room.source ?? null;
          roomIdStr = room.id ?? roomIdStr;
        }
      } catch {
        // getRoom may fail — continue with metadata-only detection
      }

      const platform = detectPlatform(roomSource, roomIdStr, meta);
      const caps = getPlatformCapabilities(platform);
      const text = formatPlatformContext(caps);

      return {
        text,
        values: {
          currentPlatform: platform,
          platformDisplayName: caps.displayName,
        },
        data: {
          platform,
          displayName: caps.displayName,
          features: caps.features,
          unavailable: caps.unavailable,
          formatting: caps.formatting,
        },
      };
    },
  };
}
