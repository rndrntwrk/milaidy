import { describe, expect, it } from "vitest";
import {
  APP_EMOTE_APPLIED_EVENT,
  APP_EMOTE_EVENT,
  type AppEmoteEventDetail,
} from "../../events";
import { createBroadcastEmoteControl } from "./broadcast-emote-control";

const emote: AppEmoteEventDetail = {
  emoteId: "dance-happy",
  path: "/animations/emotes/dance-happy.glb",
  duration: 3,
  loop: false,
};

function createTestWindow(): Window & typeof globalThis {
  const target = new EventTarget() as EventTarget & {
    CustomEvent: typeof CustomEvent;
    clearTimeout: typeof globalThis.clearTimeout;
    setTimeout: typeof globalThis.setTimeout;
  };
  target.CustomEvent = CustomEvent;
  target.setTimeout = globalThis.setTimeout.bind(globalThis);
  target.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  return target as unknown as Window & typeof globalThis;
}

describe("createBroadcastEmoteControl", () => {
  it("resolves only after the mounted VRM stage reports the matching emote applied", async () => {
    const testWindow = createTestWindow();
    const control = createBroadcastEmoteControl(testWindow, { timeoutMs: 100 });
    let dispatched: AppEmoteEventDetail | null = null;

    testWindow.addEventListener(
      APP_EMOTE_EVENT,
      (event) => {
        dispatched = (event as CustomEvent<AppEmoteEventDetail>).detail;
        queueMicrotask(() => {
          testWindow.dispatchEvent(
            new CustomEvent(APP_EMOTE_APPLIED_EVENT, { detail: emote }),
          );
        });
      },
      { once: true },
    );

    await expect(control.playEmote(emote)).resolves.toBeUndefined();
    expect(dispatched).toEqual(emote);
  });

  it("rejects when no real VRM stage acknowledges the emote", async () => {
    const control = createBroadcastEmoteControl(createTestWindow(), {
      timeoutMs: 5,
    });

    await expect(control.playEmote(emote)).rejects.toThrow(
      "VRM emote was not applied",
    );
  });
});
