import type { StartupErrorState } from "../AppContext";
import { SciFiPanel } from "./ui/SciFiPanel";
import { GlowingText } from "./ui/GlowingText";

const REASON_LABELS: Record<StartupErrorState["reason"], string> = {
  "backend-timeout": "Backend Timeout",
  "backend-unreachable": "Backend Unreachable",
  "agent-timeout": "Agent Timeout",
  "agent-error": "Agent Error",
};

interface StartupFailureViewProps {
  error: StartupErrorState;
  onRetry: () => void;
}

const APP_ORIGIN_URL = "https://app.milady.ai";

export function StartupFailureView({
  error,
  onRetry,
}: StartupFailureViewProps) {
  const isBackendUnreachable = error.reason === "backend-unreachable";

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-bg p-4 relative font-body text-txt">
      {/* Decorative background scanlines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-0" />

      <SciFiPanel className="max-w-[680px] w-full mx-auto z-10" glowColor="var(--danger)">
        <GlowingText intensity="low" glowColor="var(--danger)" className="block text-lg font-semibold mb-2 text-danger uppercase tracking-wider mb-4">
          SYSTEM FAILURE: {REASON_LABELS[error.reason] || "ERROR"}
        </GlowingText>

        <div className="p-4 border border-danger/30 bg-danger/5 mb-4 rounded-sm">
          <p className="text-danger-fg mb-2 leading-relaxed font-mono text-sm">{error.message}</p>
          {isBackendUnreachable && (
            <p className="text-danger-subtle leading-relaxed font-mono text-xs">
              This origin does not host the primary agent backend matrix.
            </p>
          )}
        </div>

        {error.detail && (
          <pre className="mb-4 p-3 border border-border rounded bg-bg-muted text-xs text-muted whitespace-pre-wrap break-words font-mono">
            {error.detail}
          </pre>
        )}

        <div className="flex items-center gap-2 mt-6">
          <button
            type="button"
            className="px-4 py-2 border border-accent bg-accent/10 text-accent text-xs cursor-pointer hover:bg-accent hover:text-bg transition-colors font-mono uppercase tracking-wider"
            onClick={onRetry}
          >
            [ RETRY_SEQUENCE ]
          </button>
          {isBackendUnreachable && (
            <a
              href={APP_ORIGIN_URL}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 border border-border bg-card text-muted-fg text-xs hover:border-accent hover:text-accent font-mono uppercase tracking-wider transition-colors"
            >
              [ SWITCH_ORIGIN ]
            </a>
          )}
        </div>
      </SciFiPanel>
    </div>
  );
}
