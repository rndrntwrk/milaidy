import { describe, expect, it } from "vitest";
import { CHARACTER_LANGUAGES } from "../contracts/onboarding.js";
import { getValidationKeywordLocaleTerms } from "./validation-keywords.js";

const NON_ENGLISH_LOCALES = CHARACTER_LANGUAGES.filter(
  (locale) => locale !== "en",
);

const AUDITED_VALIDATION_KEYWORDS = [
  "action.restart.request",
  "action.setUserName.recentContext",
  "action.appControl.launchVerb",
  "action.appControl.stopVerb",
  "action.appControl.genericTarget",
  "action.appControl.knownApp",
  "action.terminal.commandVerb",
  "action.terminal.commandFiller",
  "action.terminal.utility",
  "action.terminal.cryptoBitcoin",
  "action.terminal.cryptoEthereum",
  "action.terminal.cryptoSolana",
  "action.terminal.disk",
  "action.terminal.uptime",
  "action.terminal.memory",
  "action.terminal.process",
  "action.logLevel.command",
  "action.logLevel.setVerb",
  "action.logLevel.domain",
  "action.logLevel.level.trace",
  "action.logLevel.level.debug",
  "action.logLevel.level.info",
  "action.logLevel.level.warn",
  "action.logLevel.level.error",
  "action.updateRole.intent",
  "action.triggerCreate.request",
  "contextSignal.gmail.strong",
  "contextSignal.gmail.weak",
  "contextSignal.lifeops.strong",
  "contextSignal.lifeops.weak",
  "contextSignal.lifeops_complete.strong",
  "contextSignal.lifeops_delete.strong",
  "contextSignal.lifeops_overview.strong",
  "contextSignal.lifeops_reminder_pref.strong",
  "contextSignal.lifeops_skip.strong",
  "contextSignal.lifeops_snooze.strong",
  "contextSignal.lifeops_update.strong",
  "contextSignal.calendar.strong",
  "contextSignal.calendar.weak",
  "contextSignal.web_search.strong",
  "contextSignal.web_search.weak",
  "contextSignal.send_message.strong",
  "contextSignal.send_message.weak",
  "contextSignal.send_admin_message.strong",
  "contextSignal.send_admin_message.weak",
  "contextSignal.search_conversations.strong",
  "contextSignal.search_conversations.weak",
  "contextSignal.read_channel.strong",
  "contextSignal.read_channel.weak",
  "contextSignal.stream_control.strong",
  "contextSignal.stream_control.weak",
  "contextSignal.search_entity.strong",
  "contextSignal.search_entity.weak",
  "provider.recentConversations.relevance",
  "provider.relevantConversations.relevance",
  "provider.rolodex.relevance",
  "provider.uiCatalog.relevance",
] as const;

describe("shared validation keyword locale coverage", () => {
  it.each(AUDITED_VALIDATION_KEYWORDS)(
    "has locale terms for every supported language: %s",
    (key) => {
      for (const locale of NON_ENGLISH_LOCALES) {
        expect(getValidationKeywordLocaleTerms(key, locale).length).toBeGreaterThan(0);
      }
    },
  );
});
