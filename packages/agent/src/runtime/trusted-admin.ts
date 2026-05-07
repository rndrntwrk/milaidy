import type { IAgentRuntime, Memory, State } from "@elizaos/core";

type TrustedAdminAllowlist = {
  global: Set<string>;
  byProvider: Map<string, Set<string>>;
};

const KNOWN_PROVIDER_NAMES = new Set([
  "telegram",
  "discord",
  "slack",
  "signal",
  "whatsapp",
  "imessage",
  "bluebubbles",
  "googlechat",
  "msteams",
  "web",
  "api",
]);

const GLOBAL_ALLOWLIST_SETTING_KEYS = [
  "MILAIDY_TRUSTED_ADMIN_IDS",
  "TRUSTED_ADMIN_IDS",
];

const PROVIDER_ALLOWLIST_SETTING_KEYS: Record<string, string[]> = {
  telegram: [
    "MILAIDY_TRUSTED_ADMIN_TELEGRAM_IDS",
    "TRUSTED_ADMIN_TELEGRAM_IDS",
  ],
  discord: ["MILAIDY_TRUSTED_ADMIN_DISCORD_IDS", "TRUSTED_ADMIN_DISCORD_IDS"],
  slack: ["MILAIDY_TRUSTED_ADMIN_SLACK_IDS", "TRUSTED_ADMIN_SLACK_IDS"],
  signal: ["MILAIDY_TRUSTED_ADMIN_SIGNAL_IDS", "TRUSTED_ADMIN_SIGNAL_IDS"],
  whatsapp: [
    "MILAIDY_TRUSTED_ADMIN_WHATSAPP_IDS",
    "TRUSTED_ADMIN_WHATSAPP_IDS",
  ],
};

const INTERNAL_CONTENT_SOURCES = new Set([
  "system",
  "internal",
  "autonomous",
  "cron",
  "scheduler",
]);

function normalizeProviderName(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function normalizeIdentifier(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function toStringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item));
        }
      } catch {
        // Fall through to delimiter split.
      }
    }
    return trimmed
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function readSetting(runtime: IAgentRuntime, key: string): unknown {
  try {
    return runtime.getSetting(key);
  } catch {
    return undefined;
  }
}

function readSettingList(
  runtime: IAgentRuntime,
  keys: readonly string[],
): string[] {
  const values: string[] = [];
  for (const key of keys) {
    values.push(...toStringList(readSetting(runtime, key)));
    values.push(...toStringList(process.env[key]));
  }
  return values;
}

function addAllowlistEntry(
  allowlist: TrustedAdminAllowlist,
  provider: string | undefined,
  identifier: string,
): void {
  const normalizedId = normalizeIdentifier(identifier);
  if (!normalizedId) return;

  if (!provider) {
    allowlist.global.add(normalizedId);
    return;
  }

  const normalizedProvider = normalizeProviderName(provider);
  if (!normalizedProvider) {
    allowlist.global.add(normalizedId);
    return;
  }

  if (!allowlist.byProvider.has(normalizedProvider)) {
    allowlist.byProvider.set(normalizedProvider, new Set());
  }
  allowlist.byProvider.get(normalizedProvider)?.add(normalizedId);
}

function parseQualifiedEntry(entry: string): {
  provider?: string;
  identifier: string;
} {
  const trimmed = entry.trim();
  if (!trimmed) return { identifier: trimmed };

  const qualifierMatch = /^([a-z0-9_-]+)\s*[:=]\s*(.+)$/i.exec(trimmed);
  if (!qualifierMatch) return { identifier: trimmed };

  const provider = normalizeProviderName(qualifierMatch[1]);
  if (!provider || !KNOWN_PROVIDER_NAMES.has(provider)) {
    return { identifier: trimmed };
  }

  return { provider, identifier: qualifierMatch[2].trim() };
}

function buildTrustedAdminAllowlist(
  runtime: IAgentRuntime,
): TrustedAdminAllowlist {
  const allowlist: TrustedAdminAllowlist = {
    global: new Set(),
    byProvider: new Map(),
  };

  for (const rawEntry of readSettingList(
    runtime,
    GLOBAL_ALLOWLIST_SETTING_KEYS,
  )) {
    const parsed = parseQualifiedEntry(rawEntry);
    addAllowlistEntry(allowlist, parsed.provider, parsed.identifier);
  }

  for (const [provider, keys] of Object.entries(
    PROVIDER_ALLOWLIST_SETTING_KEYS,
  )) {
    for (const identifier of readSettingList(runtime, keys)) {
      addAllowlistEntry(allowlist, provider, identifier);
    }
  }

  return allowlist;
}

function addIdentifier(target: Set<string>, raw: unknown): void {
  if (typeof raw !== "string" && typeof raw !== "number") return;
  const value = String(raw).trim();
  if (!value) return;

  const normalized = normalizeIdentifier(value);
  if (normalized) target.add(normalized);

  if (value.startsWith("@")) {
    const noAt = normalizeIdentifier(value.slice(1));
    if (noAt) target.add(noAt);
  }
}

export function resolveMessageProvider(message: Memory): string | undefined {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const metadataProvider =
    typeof metadata?.provider === "string" ? metadata.provider : undefined;
  const contentSource =
    typeof message.content?.source === "string"
      ? message.content.source
      : undefined;
  return normalizeProviderName(metadataProvider ?? contentSource);
}

export function collectMessageSenderIdentifiers(message: Memory): string[] {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const sender = (metadata?.sender ?? {}) as Record<string, unknown>;
  const telegram = (metadata?.telegram ?? {}) as Record<string, unknown>;
  const signal = (metadata?.signal ?? {}) as Record<string, unknown>;
  const whatsapp = (metadata?.whatsapp ?? {}) as Record<string, unknown>;
  const delivery = (metadata?.delivery ?? {}) as Record<string, unknown>;
  const origin = (metadata?.origin ?? {}) as Record<string, unknown>;

  const identifiers = new Set<string>();
  addIdentifier(identifiers, message.entityId);
  addIdentifier(identifiers, sender.id);
  addIdentifier(identifiers, sender.username);
  addIdentifier(identifiers, sender.tag);
  addIdentifier(identifiers, sender.e164);
  addIdentifier(identifiers, sender.name);
  addIdentifier(identifiers, telegram.chatId);
  addIdentifier(identifiers, signal.senderId);
  addIdentifier(identifiers, whatsapp.contactId);
  addIdentifier(identifiers, delivery.to);
  addIdentifier(identifiers, origin.from);
  addIdentifier(identifiers, message.content?.target);
  return Array.from(identifiers);
}

function isSenderAllowed(
  allowlist: TrustedAdminAllowlist,
  provider: string | undefined,
  senderIds: string[],
): { trusted: boolean; matchedId?: string } {
  if (allowlist.global.has("*")) {
    return { trusted: true, matchedId: "*" };
  }

  for (const senderId of senderIds) {
    if (allowlist.global.has(senderId)) {
      return { trusted: true, matchedId: senderId };
    }
  }

  if (!provider) return { trusted: false };

  const providerSet = allowlist.byProvider.get(provider);
  if (!providerSet) return { trusted: false };
  if (providerSet.has("*")) {
    return { trusted: true, matchedId: `${provider}:*` };
  }

  for (const senderId of senderIds) {
    if (providerSet.has(senderId)) {
      return { trusted: true, matchedId: `${provider}:${senderId}` };
    }
  }

  return { trusted: false };
}

export function matchTrustedAdminAllowlist(
  runtime: IAgentRuntime,
  message: Memory,
): {
  trusted: boolean;
  provider?: string;
  senderIds: string[];
  matchedId?: string;
} {
  const provider = resolveMessageProvider(message);
  const senderIds = collectMessageSenderIdentifiers(message);
  const allowlist = buildTrustedAdminAllowlist(runtime);
  const matched = isSenderAllowed(allowlist, provider, senderIds);
  return {
    trusted: matched.trusted,
    provider,
    senderIds,
    matchedId: matched.matchedId,
  };
}

function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isTrustedAdminFromState(state: State | undefined): boolean {
  const values = state?.values as Record<string, unknown> | undefined;
  return isTruthy(values?.trustedAdmin);
}

export function isInternalAgentMessage(
  runtime: IAgentRuntime,
  message: Memory,
): boolean {
  if (message.entityId === runtime.agentId) return true;
  const source =
    typeof message.content?.source === "string"
      ? message.content.source.trim().toLowerCase()
      : "";
  if (source && INTERNAL_CONTENT_SOURCES.has(source)) return true;

  const provider = resolveMessageProvider(message);
  return provider === "system" || provider === "internal";
}

export function assertTrustedAdminForAction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  actionName: string,
): void {
  if (isInternalAgentMessage(runtime, message)) return;
  if (isTrustedAdminFromState(state)) return;

  const match = matchTrustedAdminAllowlist(runtime, message);
  if (match.trusted) return;

  const provider = match.provider ?? "unknown";
  const sender = match.senderIds[0] ?? "unknown";
  throw new Error(
    `${actionName} requires trusted admin caller (provider=${provider}, sender=${sender})`,
  );
}
