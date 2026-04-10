/**
 * ChatComposerContext — isolated context for chat input state.
 *
 * chatInput, chatSending, and chatPendingImages change on every
 * keystroke / send cycle. Keeping them in AppContext would cascade
 * re-renders to every useApp() subscriber (CompanionViewOverlay,
 * sidebar panels, settings, etc.). This context lets only the
 * composer and its direct consumers re-render.
 */

import { createContext, useContext, type MutableRefObject } from "react";

export interface ChatComposerValue {
  chatInput: string;
  chatSending: boolean;
  chatPendingImages: string[];
  setChatInput: (v: string | ((prev: string) => string)) => void;
  setChatPendingImages: (v: string[] | ((prev: string[]) => string[])) => void;
}

const DEFAULT_COMPOSER: ChatComposerValue = {
  chatInput: "",
  chatSending: false,
  chatPendingImages: [],
  setChatInput: () => {},
  setChatPendingImages: () => {},
};

export const ChatComposerCtx = createContext<ChatComposerValue>(DEFAULT_COMPOSER);

/**
 * Stable ref to the chat <textarea> / <input> element, so that
 * helpers like useContextMenu can call .focus() without subscribing
 * to every keystroke re-render.
 */
export const ChatInputRefCtx = createContext<MutableRefObject<HTMLTextAreaElement | null> | null>(null);

export function useChatComposer(): ChatComposerValue {
  return useContext(ChatComposerCtx);
}

export function useChatInputRef(): MutableRefObject<HTMLTextAreaElement | null> | null {
  return useContext(ChatInputRefCtx);
}
