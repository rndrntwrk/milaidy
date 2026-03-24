import type { CodingAgentSession } from "../api";
import { PtyConsoleBase } from "./PtyConsoleBase";

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
  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-[200] flex flex-col bg-bg border-l border-border shadow-2xl"
      style={{ width: "min(480px, 40vw)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <PtyConsoleBase
        activeSessionId={activeSessionId}
        sessions={sessions}
        onClose={onClose}
        variant="side-panel"
      />
    </div>
  );
}
