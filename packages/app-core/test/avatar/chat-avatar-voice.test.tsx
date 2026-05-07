// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_AVATAR_VOICE_EVENT } from "../../src/events";
import { useChatAvatarVoiceBridge } from "../../src/hooks/useChatAvatarVoice";

describe("useChatAvatarVoiceBridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves speaking lifecycle while audio analysis drives mouth motion", async () => {
    const emitted: Array<{ mouthOpen: number; isSpeaking: boolean }> = [];
    const handleVoiceEvent = (event: Event) => {
      emitted.push(
        (event as CustomEvent<{ mouthOpen: number; isSpeaking: boolean }>)
          .detail,
      );
    };

    window.addEventListener(CHAT_AVATAR_VOICE_EVENT, handleVoiceEvent);

    try {
      renderHook(() =>
        useChatAvatarVoiceBridge({
          mouthOpen: 0.64,
          isSpeaking: true,
          usingAudioAnalysis: true,
        }),
      );

      await waitFor(() => {
        expect(emitted.at(-1)).toEqual({
          mouthOpen: 0.64,
          isSpeaking: true,
        });
      });
    } finally {
      window.removeEventListener(CHAT_AVATAR_VOICE_EVENT, handleVoiceEvent);
    }
  });
});
