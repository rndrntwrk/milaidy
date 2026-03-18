import type { ConversationMode } from "../api/client";
import {
  DEFAULT_UI_LANGUAGE,
  normalizeLanguage,
  type UiLanguage,
} from "../i18n";
import type { UiShellMode } from "./types";
import { normalizeAvatarIndex } from "./vrm";

const UI_LANGUAGE_STORAGE_KEY = "milady:ui-language";
const UI_SHELL_MODE_STORAGE_KEY = "milady:ui-shell-mode";
const PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY =
  "milady:pro-streamer-shell-default";
const PRO_STREAMER_SHELL_DEFAULT_VERSION = "2026-03-18";
const PRO_STREAMER_THEME_ID = "milady-os";

export function loadUiLanguage(): UiLanguage {
  try {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    return normalizeLanguage(stored ?? DEFAULT_UI_LANGUAGE);
  } catch {
    return DEFAULT_UI_LANGUAGE;
  }
}

export function saveUiLanguage(language: UiLanguage): void {
  try {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
  } catch {
    // ignore
  }
}

function normalizeUiShellMode(mode: unknown): UiShellMode {
  return mode === "native" ? "native" : "companion";
}
export { normalizeUiShellMode };

function shouldBootstrapProStreamerShell(theme: unknown): boolean {
  return theme === PRO_STREAMER_THEME_ID;
}

function markProStreamerShellDefaultApplied(): void {
  localStorage.setItem(
    PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY,
    PRO_STREAMER_SHELL_DEFAULT_VERSION,
  );
}

export function loadUiShellMode(theme?: string): UiShellMode {
  try {
    const storedShellMode = localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY);
    const normalized =
      storedShellMode === null ? null : normalizeUiShellMode(storedShellMode);
    if (shouldBootstrapProStreamerShell(theme)) {
      const bootstrapped =
        localStorage.getItem(PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY) ===
        PRO_STREAMER_SHELL_DEFAULT_VERSION;
      if (!bootstrapped) {
        markProStreamerShellDefaultApplied();
        if (normalized !== "native") {
          localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, "native");
          return "native";
        }
      }
      if (normalized) return normalized;
      localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, "native");
      return "native";
    }
    return normalized ?? "companion";
  } catch {
    return shouldBootstrapProStreamerShell(theme) ? "native" : "companion";
  }
}

export function saveUiShellMode(mode: UiShellMode): void {
  try {
    localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, normalizeUiShellMode(mode));
  } catch {
    // ignore
  }
}

export function enableProStreamerShellMode(): UiShellMode {
  try {
    localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, "native");
    markProStreamerShellDefaultApplied();
  } catch {
    // ignore
  }
  return "native";
}

/* ── Avatar persistence ───────────────────────────────────────────────── */
const AVATAR_INDEX_KEY = "milady_avatar_index";

export function loadAvatarIndex(): number {
  try {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
  } catch {
    /* ignore */
  }
  return 1;
}

export function saveAvatarIndex(index: number): void {
  try {
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  } catch {
    /* ignore */
  }
}

/* ── Chat UI persistence ──────────────────────────────────────────────── */
const CHAT_AVATAR_VISIBLE_KEY = "milady:chat:avatarVisible";
const CHAT_VOICE_MUTED_KEY = "milady:chat:voiceMuted";

export function loadChatAvatarVisible(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_AVATAR_VISIBLE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function loadChatVoiceMuted(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_VOICE_MUTED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function saveChatAvatarVisible(value: boolean): void {
  try {
    localStorage.setItem(CHAT_AVATAR_VISIBLE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export function saveChatVoiceMuted(value: boolean): void {
  try {
    localStorage.setItem(CHAT_VOICE_MUTED_KEY, String(value));
  } catch {
    /* ignore */
  }
}

/* ── Chat mode persistence ─────────────────────────────────────────────── */
const CHAT_MODE_KEY = "milady:chat:mode";

export function loadChatMode(): ConversationMode {
  try {
    const stored = localStorage.getItem(CHAT_MODE_KEY);
    return stored === "power" ? "power" : "simple";
  } catch {
    return "simple";
  }
}

export function saveChatMode(value: ConversationMode): void {
  try {
    localStorage.setItem(CHAT_MODE_KEY, value);
  } catch {
    /* ignore */
  }
}
