// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_EMOTE_EVENT, STOP_EMOTE_EVENT } from "../events";
import type { EmoteInfo } from "../api";
import {
  playAppEmote,
  shouldIgnoreRemoteAppEmoteEvent,
  stopAppEmote,
} from "./app-emote-runtime";

const playEmoteMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("../api", () => ({
  client: {
    playEmote: playEmoteMock,
  },
}));

const SAMPLE_EMOTE: EmoteInfo = {
  id: "wave",
  name: "Wave",
  description: "Wave hello",
  path: "/animations/emotes/waving-both-hands.glb",
  duration: 2.5,
  loop: false,
  category: "greeting",
};

describe("app-emote-runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T01:30:00.000Z"));
    playEmoteMock.mockClear();
  });

  afterEach(() => {
    window.document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("dispatches a local app emote event before syncing the backend", async () => {
    const handler = vi.fn();
    window.addEventListener(APP_EMOTE_EVENT, handler);

    const detail = await playAppEmote(SAMPLE_EMOTE, {
      showOverlay: false,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        emoteId: SAMPLE_EMOTE.id,
        path: SAMPLE_EMOTE.path,
        duration: SAMPLE_EMOTE.duration,
        loop: SAMPLE_EMOTE.loop,
        showOverlay: false,
      },
    });
    expect(playEmoteMock).toHaveBeenCalledWith(SAMPLE_EMOTE.id);
    expect(detail).toMatchObject({
      emoteId: SAMPLE_EMOTE.id,
      path: SAMPLE_EMOTE.path,
      duration: SAMPLE_EMOTE.duration,
      loop: SAMPLE_EMOTE.loop,
    });

    window.removeEventListener(APP_EMOTE_EVENT, handler);
  });

  it("can force a loop-capable emote to play a single cycle", async () => {
    const handler = vi.fn();
    window.addEventListener(APP_EMOTE_EVENT, handler);

    await playAppEmote(
      {
        ...SAMPLE_EMOTE,
        id: "dance-happy",
        loop: true,
      },
      {
        singleCycle: true,
      },
    );

    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      detail: expect.objectContaining({
        emoteId: "dance-happy",
        loop: false,
      }),
    });

    window.removeEventListener(APP_EMOTE_EVENT, handler);
  });

  it("dedupes a matching remote emote echo for a short window", async () => {
    const detail = await playAppEmote(SAMPLE_EMOTE);

    expect(shouldIgnoreRemoteAppEmoteEvent(detail)).toBe(true);

    vi.advanceTimersByTime(1600);

    expect(shouldIgnoreRemoteAppEmoteEvent(detail)).toBe(false);
  });

  it("dispatches the stop event locally", () => {
    const handler = vi.fn();
    document.addEventListener(STOP_EMOTE_EVENT, handler);

    stopAppEmote();

    expect(handler).toHaveBeenCalledTimes(1);

    document.removeEventListener(STOP_EMOTE_EVENT, handler);
  });
});
