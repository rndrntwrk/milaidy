import { useEffect, useRef } from "react";
import { client } from "../api";

/**
 * Renders a single xterm.js terminal for a PTY session.
 * On mount: loads xterm lazily, hydrates buffered output, subscribes to live data.
 * On unmount: unsubscribes and disposes.
 */
export function PtyTerminalPane({
  sessionId,
  visible,
}: {
  sessionId: string;
  visible: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ dispose: () => void } | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    let disposed = false;
    let unsub: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        fontSize: 12,
        fontFamily: "var(--font-mono, monospace)",
        convertEol: true,
        scrollback: 5000,
        cursorBlink: true,
        theme: {
          background: "#0a0a0a",
          foreground: "#e4e4e7",
          cursor: "#5a9a2a",
          selectionBackground: "rgba(90, 154, 42, 0.3)",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(containerRef.current);

      fitRef.current = fitAddon;
      termRef.current = {
        dispose: () => {
          resizeObserver?.disconnect();
          term.dispose();
        },
      };

      // Double-rAF to let the drawer layout settle before fitting
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!disposed) {
            try {
              fitAddon.fit();
            } catch {
              // Container may not have layout yet
            }
          }
        });
      });

      // Hydrate with buffered output
      try {
        const buf = await client.getPtyBufferedOutput(sessionId);
        if (!disposed && buf) {
          // Strip clear-scrollback ANSI escape to preserve scroll history
          // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape
          term.write(buf.replace(/\x1b\[3J/g, ""));
          term.scrollToBottom();
        }
      } catch {
        // Session may have ended
      }

      // Subscribe to live output AFTER hydration
      client.subscribePtyOutput(sessionId);
      unsub = client.onWsEvent(
        "pty-output",
        (data: Record<string, unknown>) => {
          if (
            data.sessionId === sessionId &&
            typeof data.data === "string" &&
            !disposed
          ) {
            // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape
            term.write(data.data.replace(/\x1b\[3J/g, ""));
          }
        },
      );

      // Forward keyboard input for manual interjection
      term.onData((data) => {
        if (!disposed) {
          try {
            client.sendPtyInput(sessionId, data);
          } catch {
            // writeRaw may timeout if worker is busy — non-fatal
          }
        }
      });

      // Resize handling
      resizeObserver = new ResizeObserver(() => {
        if (disposed || !containerRef.current) return;
        if (containerRef.current.clientHeight < 10) return;
        try {
          fitAddon.fit();
          client.resizePty(sessionId, term.cols, term.rows);
        } catch {
          // Ignore fit errors during transitions
        }
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      unsub?.();
      client.unsubscribePtyOutput(sessionId);
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      mountedRef.current = false;
    };
  }, [sessionId]);

  // Re-fit when becoming visible
  useEffect(() => {
    if (!visible || !fitRef.current) return;
    const frameId = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // Container may not have layout yet
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        display: visible ? "block" : "none",
      }}
    />
  );
}
