import { client, type EmoteInfo } from "../api";
import {
  dispatchAppEmoteEvent,
  dispatchAppEvent,
  STOP_EMOTE_EVENT,
  type AppEmoteEventDetail,
} from "../events";

const LOCAL_APP_EMOTE_ECHO_DEDUPE_WINDOW_MS = 1500;

const recentLocalAppEmotes = new Map<string, number>();

function toRecentEmoteKey(detail: Pick<AppEmoteEventDetail, "emoteId" | "path">) {
  return `${detail.emoteId}::${detail.path}`;
}

function pruneRecentLocalAppEmotes(now = Date.now()) {
  for (const [key, timestamp] of recentLocalAppEmotes.entries()) {
    if (now - timestamp > LOCAL_APP_EMOTE_ECHO_DEDUPE_WINDOW_MS) {
      recentLocalAppEmotes.delete(key);
    }
  }
}

export function createAppEmoteEventDetail(
  emote: EmoteInfo,
  options?: { showOverlay?: boolean; singleCycle?: boolean },
): AppEmoteEventDetail {
  return {
    emoteId: emote.id,
    path: emote.path,
    duration: emote.duration,
    loop: options?.singleCycle ? false : emote.loop,
    showOverlay: options?.showOverlay ?? false,
  };
}

export function dispatchLocalAppEmoteEvent(detail: AppEmoteEventDetail): void {
  const now = Date.now();
  pruneRecentLocalAppEmotes(now);
  recentLocalAppEmotes.set(toRecentEmoteKey(detail), now);
  dispatchAppEmoteEvent(detail);
}

export function shouldIgnoreRemoteAppEmoteEvent(
  detail: AppEmoteEventDetail,
): boolean {
  const now = Date.now();
  pruneRecentLocalAppEmotes(now);
  const timestamp = recentLocalAppEmotes.get(toRecentEmoteKey(detail));
  return timestamp != null && now - timestamp <= LOCAL_APP_EMOTE_ECHO_DEDUPE_WINDOW_MS;
}

export async function playAppEmote(
  emote: EmoteInfo,
  options?: {
    showOverlay?: boolean;
    syncServer?: boolean;
    singleCycle?: boolean;
  },
): Promise<AppEmoteEventDetail> {
  const detail = createAppEmoteEventDetail(emote, options);
  dispatchLocalAppEmoteEvent(detail);
  if (options?.syncServer !== false) {
    await client.playEmote(emote.id);
  }
  return detail;
}

export function stopAppEmote(): void {
  dispatchAppEvent(STOP_EMOTE_EVENT);
}
