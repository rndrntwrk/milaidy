// @vitest-environment jsdom

import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChatComposerCtx,
  ChatInputRefCtx,
  useChatComposer,
  useChatInputRef,
  type ChatComposerValue,
} from "./ChatComposerContext";

describe("ChatComposerContext", () => {
  describe("useChatComposer", () => {
    it("returns default values when no provider wraps the consumer", () => {
      const { result } = renderHook(() => useChatComposer());

      expect(result.current.chatInput).toBe("");
      expect(result.current.chatSending).toBe(false);
      expect(result.current.chatPendingImages).toEqual([]);
      expect(typeof result.current.setChatInput).toBe("function");
      expect(typeof result.current.setChatPendingImages).toBe("function");
    });

    it("returns the provided value when wrapped in ChatComposerCtx.Provider", () => {
      const customValue: ChatComposerValue = {
        chatInput: "hello world",
        chatSending: true,
        chatPendingImages: ["img1.png", "img2.png"],
        setChatInput: () => {},
        setChatPendingImages: () => {},
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ChatComposerCtx.Provider value={customValue}>
          {children}
        </ChatComposerCtx.Provider>
      );

      const { result } = renderHook(() => useChatComposer(), { wrapper });

      expect(result.current.chatInput).toBe("hello world");
      expect(result.current.chatSending).toBe(true);
      expect(result.current.chatPendingImages).toEqual([
        "img1.png",
        "img2.png",
      ]);
    });
  });

  describe("useChatInputRef", () => {
    it("returns null when no provider wraps the consumer", () => {
      const { result } = renderHook(() => useChatInputRef());

      expect(result.current).toBeNull();
    });

    it("returns the provided ref when wrapped in ChatInputRefCtx.Provider", () => {
      const ref = { current: null } as React.MutableRefObject<HTMLTextAreaElement | null>;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ChatInputRefCtx.Provider value={ref}>
          {children}
        </ChatInputRefCtx.Provider>
      );

      const { result } = renderHook(() => useChatInputRef(), { wrapper });

      expect(result.current).toBe(ref);
    });
  });
});
