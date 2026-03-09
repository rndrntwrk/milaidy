/**
 * Terminal panel — shows output from agent-initiated commands.
 *
 * Listens for "terminal-output" WebSocket events from the server and renders
 * a collapsible bottom panel with command output. Auto-opens when a command starts.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { client } from "../api-client";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { CloseIcon, TerminalIcon } from "./ui/Icons.js";

export interface TerminalPanelHandle {
  /** Programmatically run a command via the API. */
  runCommand: (command: string) => void;
}

interface TerminalLine {
  id: string;
  type: "command" | "stdout" | "stderr" | "exit" | "error";
  text: string;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle>(
  function TerminalPanel(_props, ref) {
    const [open, setOpen] = useState(false);
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);

    const addLine = useCallback((type: TerminalLine["type"], text: string) => {
      const id = String(++lineIdRef.current);
      setLines((prev) => {
        // Cap at 500 lines to prevent memory bloat
        const next = [...prev, { id, type, text }];
        return next.length > 500 ? next.slice(-500) : next;
      });
    }, []);

    // Auto-scroll to bottom on new lines
    useEffect(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, []);

    // Listen for terminal-output WebSocket events
    useEffect(() => {
      const unbind = client.onWsEvent(
        "terminal-output",
        (data: Record<string, unknown>) => {
          const event = data.event as string;
          switch (event) {
            case "start":
              setOpen(true);
              addLine("command", `$ ${data.command as string}`);
              break;
            case "stdout":
              addLine("stdout", data.data as string);
              break;
            case "stderr":
              addLine("stderr", data.data as string);
              break;
            case "exit":
              addLine(
                "exit",
                `Process exited with code ${data.code as number}`,
              );
              break;
            case "error":
              addLine("error", `Error: ${data.data as string}`);
              break;
          }
        },
      );
      return unbind;
    }, [addLine]);

    // Imperative handle for programmatic command execution
    useImperativeHandle(ref, () => ({
      runCommand: async (command: string) => {
        setOpen(true);
        try {
          await client.runTerminalCommand(command);
        } catch (err) {
          addLine(
            "error",
            `Failed to send command: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    }));

    const handleClear = useCallback(() => {
      setLines([]);
      lineIdRef.current = 0;
    }, []);

    if (!open) return null;

    return (
      <Card className="flex h-[220px] flex-col overflow-hidden rounded-none border-x-0 border-b-0 border-t border-white/10 bg-[#07090e]/94 shadow-none">
        {/* Header bar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
          <TerminalIcon className="h-4 w-4 text-white/56" />
          <span className="text-[11px] font-mono tracking-[0.18em] text-white/52">
            TERMINAL
          </span>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" className="rounded-xl px-2 text-[10px]" onClick={handleClear}>
            Clear
          </Button>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => setOpen(false)} aria-label="Close terminal">
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Output area */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-all"
        >
          {lines.length === 0 ? (
            <span className="text-[11px] italic text-white/42">
              Terminal output will appear here when the agent runs commands.
            </span>
          ) : (
            lines.map((line) => (
              <div
                key={line.id}
                className={
                  line.type === "command"
                    ? "text-accent font-bold"
                    : line.type === "stderr" || line.type === "error"
                      ? "text-destructive"
                      : line.type === "exit"
                        ? "text-white/40"
                        : "text-white/78"
                }
              >
                {line.text}
              </div>
            ))
          )}
        </div>
      </Card>
    );
  },
);
