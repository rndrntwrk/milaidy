const SUPPORTED_MESSAGING_CHANNELS = [
  "discord",
  "telegram",
  "slack",
  "whatsapp",
  "twitch",
] as const;
type MessagingChannel = (typeof SUPPORTED_MESSAGING_CHANNELS)[number];

const MESSAGING_CHANNEL_ALIAS_MAP: Record<string, MessagingChannel> = {
  discordapp: "discord",
  discordd: "discord",
  discrod: "discord",
  disord: "discord",
  tg: "telegram",
  tele: "telegram",
  telegramm: "telegram",
  whatsap: "whatsapp",
  whatsappp: "whatsapp",
  twitchtv: "twitch",
};

const MESSAGING_CHANNEL_REGEX =
  /\b(discord|telegram|slack|whatsapp|twitch)\b/i;
const MESSAGING_TARGET_ID_REGEX =
  /(?:user(?:\s+id)?|chat(?:\s+id)?|target(?:\s+id)?|id)\s*[:#]?\s*(-?\d{6,})\b/i;
const GENERIC_NUMERIC_ID_REGEX = /\b-?\d{6,}\b/;
const TELEGRAM_HANDLE_REGEX = /@([a-zA-Z0-9_]{4,})/;

function inferMessageBody(text: string): string | null {
  const quoted = text.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const byVerb = text.match(/\b(?:saying|say|message|text)\b[:\s-]+(.+)$/i);
  if (byVerb?.[1]?.trim()) return byVerb[1].trim();

  return null;
}

function inferMessagingChannelToken(token: string): MessagingChannel | null {
  const normalized = token.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return null;

  if (
    SUPPORTED_MESSAGING_CHANNELS.includes(normalized as MessagingChannel)
  ) {
    return normalized as MessagingChannel;
  }

  const aliasMatch = MESSAGING_CHANNEL_ALIAS_MAP[normalized];
  if (aliasMatch) return aliasMatch;

  for (const channel of SUPPORTED_MESSAGING_CHANNELS) {
    if (
      normalized.startsWith(channel) &&
      normalized.length - channel.length <= 2
    ) {
      return channel;
    }
    if (
      channel.startsWith(normalized) &&
      channel.length - normalized.length <= 1
    ) {
      return channel;
    }
  }

  return null;
}

export function inferMessagingParams(text: string): {
  channel?: string;
  to?: string;
  messageText?: string;
} {
  const inferred: { channel?: string; to?: string; messageText?: string } = {};
  if (!text.trim()) return inferred;

  const channelMatch = text.match(MESSAGING_CHANNEL_REGEX);
  const exactChannel = inferMessagingChannelToken(channelMatch?.[1] ?? "");
  if (exactChannel) {
    inferred.channel = exactChannel;
  } else {
    const tokens = text.split(/[^a-zA-Z0-9]+/g);
    for (const token of tokens) {
      const fuzzyChannel = inferMessagingChannelToken(token);
      if (fuzzyChannel) {
        inferred.channel = fuzzyChannel;
        break;
      }
    }
  }

  const explicitId = text.match(MESSAGING_TARGET_ID_REGEX)?.[1];
  const fallbackId = text.match(GENERIC_NUMERIC_ID_REGEX)?.[0];
  const telegramHandle = text.match(TELEGRAM_HANDLE_REGEX)?.[1];
  if (explicitId) {
    inferred.to = explicitId;
  } else if (fallbackId) {
    inferred.to = fallbackId;
  } else if (inferred.channel === "telegram" && telegramHandle) {
    inferred.to = `@${telegramHandle}`;
  }

  const messageText = inferMessageBody(text);
  if (messageText) {
    inferred.messageText = messageText;
  }

  return inferred;
}
