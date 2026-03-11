import type { StartupErrorState } from "../AppContext";
import { MiladyBootShell } from "./MiladyBootShell.js";

const REASON_LABELS: Record<StartupErrorState["reason"], string> = {
  "backend-timeout": "Backend Timeout",
  "backend-unreachable": "Backend Unreachable",
  "agent-timeout": "Agent Timeout",
  "agent-error": "Agent Error",
};

interface StartupFailureViewProps {
  error: StartupErrorState;
  onRetry: () => void;
  currentTheme?: string;
  agentName?: string | null;
}

const APP_ORIGIN_URL = "https://app.milady.ai";

export function StartupFailureView({
  error,
  onRetry,
  currentTheme = "milady-os",
  agentName,
}: StartupFailureViewProps) {
  const isBackendUnreachable = error.reason === "backend-unreachable";
  const heading = REASON_LABELS[error.reason] || "Startup Error";
  const content = (
    <div className="p-6">
      <div className="mb-4 rounded-sm border border-danger/30 bg-danger/5 p-4">
        <p className="mb-2 font-mono text-sm leading-relaxed text-danger-fg">
          {error.message}
        </p>
        {isBackendUnreachable ? (
          <p className="font-mono text-xs leading-relaxed text-danger-subtle">
            This origin does not host the agent backend.
          </p>
        ) : null}
      </div>

      {error.detail ? (
        <pre className="mb-4 whitespace-pre-wrap break-words rounded border border-border bg-bg-muted p-3 font-mono text-xs text-muted">
          {error.detail}
        </pre>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cursor-pointer border border-accent bg-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-bg"
          onClick={onRetry}
        >
          [ RETRY_SEQUENCE ]
        </button>
        {isBackendUnreachable ? (
          <a
            href={APP_ORIGIN_URL}
            target="_blank"
            rel="noreferrer"
            className="border border-border bg-card px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-fg transition-colors hover:border-accent hover:text-accent"
          >
            [ OPEN_APP ]
          </a>
        ) : null}
      </div>
    </div>
  );

  if (currentTheme !== "milady-os") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
        <div className="w-full max-w-[680px] rounded-[20px] border border-border bg-card p-6">
          <h1 className="mb-2 text-lg font-semibold text-txt-strong">
            {heading}
          </h1>
          <p className="mb-4 leading-relaxed text-muted">
            Startup sequence interrupted
          </p>
          {content}
        </div>
      </div>
    );
  }

  return (
    <MiladyBootShell
      title={`SYSTEM FAILURE: ${heading}`}
      subtitle="Startup sequence interrupted"
      status={error.reason}
      accent="danger"
      identityLabel={agentName ?? undefined}
      panelClassName="max-w-[680px] mx-auto"
    >
      {content}
    </MiladyBootShell>
  );
}
