import { useCallback, useState } from "react";
import type { CodingAgentSession } from "../api";
import "@xterm/xterm/css/xterm.css";
import { PtyTerminalPane } from "./PtyTerminalPane";

const STATUS_DOT: Record<string, string> = {
  active: "bg-ok",
  tool_running: "bg-accent",
  blocked: "bg-warn",
  error: "bg-danger",
};

const PULSE_STATUSES = new Set(["active", "tool_running"]);

interface PtyConsoleSidePanelProps {
  activeSessionId: string;
  sessions: CodingAgentSession[];
  onClose: () => void;
}

export function PtyConsoleSidePanel({
  activeSessionId,
  sessions,
  onClose,
}: PtyConsoleSidePanelProps) {
  const [selectedId, setSelectedId] = useState(activeSessionId);

  const resolvedId =
    sessions.find((s) => s.sessionId === selectedId)?.sessionId ??
    sessions[0]?.sessionId;

  const handleTabClick = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  if (!sessions.length) return null;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-[200] flex flex-col bg-bg border-l border-border shadow-2xl"
      style={{ width: "min(480px, 40vw)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-txt">Agent Consoles</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted hover:text-txt transition-colors cursor-pointer rounded hover:bg-bg-hover"
          aria-label="Close console panel"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border px-2 shrink-0 overflow-x-auto">
        {sessions.map((s) => {
          const isActive = s.sessionId === resolvedId;
          return (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => handleTabClick(s.sessionId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "border-accent text-txt"
                  : "border-transparent text-muted hover:text-txt"
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                  STATUS_DOT[s.status] ?? "bg-muted"
                }${PULSE_STATUSES.has(s.status) ? " animate-pulse" : ""}`}
              />
              <span className="truncate max-w-[120px]">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Terminal panes */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {sessions.map((s) => (
          <PtyTerminalPane
            key={s.sessionId}
            sessionId={s.sessionId}
            visible={s.sessionId === resolvedId}
          />
        ))}
      </div>
    </div>
  );
}
