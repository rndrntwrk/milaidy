/**
 * Content script injected into every page.
 *
 * Emits `focus-changed` events when the page's visibility state flips, so
 * the background can credit/uncredit focus time even when tab/window
 * events don't fire (e.g. switching focus within a single tab via the
 * browser chrome).
 */

import type { InternalMessage } from "./types.js";

function currentDomain(): string {
  return location.hostname.toLowerCase();
}

function emitFocusChange(visible: boolean): void {
  const message: InternalMessage = {
    kind: "focus-changed",
    payload: {
      domain: currentDomain(),
      visible,
      observedAt: Date.now(),
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be asleep; the background re-wakes on the next
    // tab event. Dropping the occasional transition is acceptable.
  });
}

document.addEventListener("visibilitychange", () => {
  emitFocusChange(document.visibilityState === "visible");
});

window.addEventListener("focus", () => emitFocusChange(true));
window.addEventListener("blur", () => emitFocusChange(false));

emitFocusChange(document.visibilityState === "visible");
