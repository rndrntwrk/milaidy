import { Button } from "@miladyai/ui";
import { useBranding } from "../config/branding";
import type { StartupErrorState } from "../state";
import { useApp } from "../state";

const REASON_LABELS: Record<StartupErrorState["reason"], string> = {
  "backend-timeout": "Backend Timeout",
  "backend-unreachable": "Backend Unreachable",
  "agent-timeout": "Agent Timeout",
  "agent-error": "Agent Error",
  "asset-missing": "Asset Missing",
};

interface StartupFailureViewProps {
  error: StartupErrorState;
  onRetry: () => void;
}

export function StartupFailureView({
  error,
  onRetry,
}: StartupFailureViewProps) {
  const { t } = useApp();
  const branding = useBranding();
  const isBackendUnreachable = error.reason === "backend-unreachable";

  return (
    <div className="max-w-[680px] mx-auto mt-15 p-6 border border-border bg-card rounded-[10px]">
      <h1 className="text-lg font-semibold mb-2 text-danger">
        {t("startupfailureview.StartupFailed")} {REASON_LABELS[error.reason]}
      </h1>
      <p className="text-txt-strong mb-3 leading-relaxed">{error.message}</p>
      {isBackendUnreachable && (
        <p className="text-muted mb-3 leading-relaxed">
          {t("startupfailureview.ThisOriginDoesNot")}
        </p>
      )}
      {error.detail && (
        <pre className="mb-4 p-3 border border-border rounded bg-bg-muted text-xs text-muted whitespace-pre-wrap break-words">
          {error.detail}
        </pre>
      )}
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={onRetry}>
          {t("startupfailureview.RetryStartup")}
        </Button>
        {isBackendUnreachable && (
          <Button variant="outline" size="sm" asChild>
            <a href={branding.appUrl} target="_blank" rel="noreferrer">
              {t("startupfailureview.OpenApp")}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
