import {
  APP_EMOTE_APPLIED_EVENT,
  APP_EMOTE_EVENT,
  type AppEmoteEventDetail,
} from "../../events";

const DEFAULT_APPLY_TIMEOUT_MS = 15_000;

export interface BroadcastEmoteControl {
  source: "broadcast-shell";
  playEmote(detail: AppEmoteEventDetail): Promise<void>;
}

function isValidEmote(detail: AppEmoteEventDetail): boolean {
  return Boolean(
    detail &&
      typeof detail.emoteId === "string" &&
      detail.emoteId.trim() &&
      typeof detail.path === "string" &&
      detail.path.trim() &&
      typeof detail.duration === "number" &&
      Number.isFinite(detail.duration) &&
      detail.duration > 0 &&
      typeof detail.loop === "boolean",
  );
}

function isMatchingAppliedEmote(
  candidate: AppEmoteEventDetail | undefined,
  expected: AppEmoteEventDetail,
): boolean {
  return Boolean(
    candidate &&
      candidate.emoteId === expected.emoteId &&
      candidate.path === expected.path &&
      candidate.duration === expected.duration &&
      candidate.loop === expected.loop,
  );
}

/**
 * Bridge the capture worker's page control to the same event path used by the
 * mounted companion. The promise resolves only after VrmStage reports that
 * VrmEngine.playEmote actually started, so a stub cannot satisfy production
 * readiness or reaction proof.
 */
export function createBroadcastEmoteControl(
  targetWindow: Window & typeof globalThis,
  { timeoutMs = DEFAULT_APPLY_TIMEOUT_MS }: { timeoutMs?: number } = {},
): BroadcastEmoteControl {
  return {
    source: "broadcast-shell",
    async playEmote(detail: AppEmoteEventDetail): Promise<void> {
      if (!isValidEmote(detail)) {
        throw new Error("Invalid broadcast VRM emote payload");
      }

      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          targetWindow.clearTimeout(timeout);
          targetWindow.removeEventListener(APP_EMOTE_APPLIED_EVENT, onApplied);
        };
        const onApplied = (event: Event): void => {
          const applied = (event as CustomEvent<AppEmoteEventDetail>).detail;
          if (!isMatchingAppliedEmote(applied, detail)) return;
          cleanup();
          resolve();
        };
        const timeout = targetWindow.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              "VRM emote was not applied before the broadcast deadline",
            ),
          );
        }, timeoutMs);

        targetWindow.addEventListener(APP_EMOTE_APPLIED_EVENT, onApplied);
        targetWindow.dispatchEvent(
          new targetWindow.CustomEvent(APP_EMOTE_EVENT, { detail }),
        );
      });
    },
  };
}
