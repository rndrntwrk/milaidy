import type { CharacterLanguage } from "@miladyai/shared/contracts/onboarding";
import { getValidationKeywordTerms } from "@miladyai/shared/validation-keywords";
import { normalizeCharacterLanguage } from "../onboarding-presets.js";

export type ContextSignalKey =
  | "calendar"
  | "gmail"
  | "lifeops"
  | "lifeops_complete"
  | "lifeops_delete"
  | "lifeops_overview"
  | "lifeops_reminder_pref"
  | "lifeops_skip"
  | "lifeops_snooze"
  | "lifeops_update"
  | "read_channel"
  | "search_conversations"
  | "search_entity"
  | "send_admin_message"
  | "send_message"
  | "stream_control"
  | "web_search";

export type ContextSignalStrength = "strong" | "weak";

type ContextSignalSpec = {
  contextLimit?: number;
  weakThreshold?: number;
  keywordKeys: {
    strong: string;
    weak?: string;
  };
};

export type ResolvedContextSignalSpec = {
  locale: CharacterLanguage;
  contextLimit: number;
  weakThreshold: number;
  strongTerms: string[];
  weakTerms: string[];
};

const DEFAULT_CONTEXT_LIMIT = 8;
const DEFAULT_WEAK_THRESHOLD = 2;

const CONTEXT_SIGNAL_SPECS: Record<ContextSignalKey, ContextSignalSpec> = {
  gmail: {
    contextLimit: 12,
    weakThreshold: 2,
    keywordKeys: {
      strong: "contextSignal.gmail.strong",
      weak: "contextSignal.gmail.weak",
    },
  },
  calendar: {
    contextLimit: 12,
    keywordKeys: {
      strong: "contextSignal.calendar.strong",
      weak: "contextSignal.calendar.weak",
    },
  },
  web_search: {
    contextLimit: 6,
    keywordKeys: {
      strong: "contextSignal.web_search.strong",
      weak: "contextSignal.web_search.weak",
    },
  },
  send_message: {
    keywordKeys: {
      strong: "contextSignal.send_message.strong",
      weak: "contextSignal.send_message.weak",
    },
  },
  send_admin_message: {
    keywordKeys: {
      strong: "contextSignal.send_admin_message.strong",
      weak: "contextSignal.send_admin_message.weak",
    },
  },
  search_conversations: {
    keywordKeys: {
      strong: "contextSignal.search_conversations.strong",
      weak: "contextSignal.search_conversations.weak",
    },
  },
  read_channel: {
    keywordKeys: {
      strong: "contextSignal.read_channel.strong",
      weak: "contextSignal.read_channel.weak",
    },
  },
  stream_control: {
    keywordKeys: {
      strong: "contextSignal.stream_control.strong",
      weak: "contextSignal.stream_control.weak",
    },
  },
  search_entity: {
    keywordKeys: {
      strong: "contextSignal.search_entity.strong",
      weak: "contextSignal.search_entity.weak",
    },
  },
};

export function resolveContextSignalSpec(
  key: ContextSignalKey,
  localeInput?: unknown,
  options?: {
    includeAllLocales?: boolean;
  },
): ResolvedContextSignalSpec {
  const locale = normalizeCharacterLanguage(localeInput);
  const spec = CONTEXT_SIGNAL_SPECS[key];
  const includeAllLocales = options?.includeAllLocales ?? false;

  return {
    locale,
    contextLimit: spec.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
    weakThreshold: spec.weakThreshold ?? DEFAULT_WEAK_THRESHOLD,
    strongTerms: getValidationKeywordTerms(spec.keywordKeys.strong, {
      includeAllLocales,
      locale,
    }),
    weakTerms: spec.keywordKeys.weak
      ? getValidationKeywordTerms(spec.keywordKeys.weak, {
          includeAllLocales,
          locale,
        })
      : [],
  };
}

export function getContextSignalTerms(
  key: ContextSignalKey,
  strength: ContextSignalStrength,
  options?: {
    includeAllLocales?: boolean;
    locale?: unknown;
  },
): string[] {
  const spec = CONTEXT_SIGNAL_SPECS[key];
  const keywordKey =
    strength === "strong" ? spec.keywordKeys.strong : spec.keywordKeys.weak;
  if (!keywordKey) {
    return [];
  }

  return getValidationKeywordTerms(keywordKey, {
    includeAllLocales: options?.includeAllLocales ?? false,
    locale: options?.locale,
  });
}
