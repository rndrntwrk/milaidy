import { useEffect, useRef, useState } from "react";

/**
 * Tracks `document.visibilityState === "visible"`.
 *
 * **WHY:** background tabs should not keep polling the network or driving WebGL
 * at full rate — this hook centralizes the `visibilitychange` subscription.
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible",
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return visible;
}

/**
 * Runs `callback` every `delayMs` only while the document is **visible** and
 * `enabled` is true. **WHY:** avoids `setInterval` wakeups and network work in
 * background tabs without duplicating visibility logic in every view.
 */
export function useIntervalWhenDocumentVisible(
  callback: () => void,
  delayMs: number,
  enabled = true,
): void {
  const saved = useRef(callback);
  saved.current = callback;
  const visible = useDocumentVisibility();

  useEffect(() => {
    if (!enabled || !visible) return;
    const id = window.setInterval(() => {
      saved.current();
    }, delayMs);
    return () => window.clearInterval(id);
  }, [enabled, visible, delayMs]);
}
