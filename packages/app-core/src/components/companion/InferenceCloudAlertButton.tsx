import { IconTooltip } from "@miladyai/ui";
import { AlertTriangle } from "lucide-react";
import { memo, type PointerEvent } from "react";
import type { CompanionInferenceNotice } from "./resolve-companion-inference-notice";

export interface InferenceCloudAlertButtonProps {
  notice: CompanionInferenceNotice;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}

export const InferenceCloudAlertButton = memo(function InferenceCloudAlertButton(
  props: InferenceCloudAlertButtonProps,
) {
  const { notice, onPointerDown, onClick } = props;
  const isDanger = notice.variant === "danger";

  return (
    <IconTooltip label={notice.tooltip} position="bottom" multiline>
      <button
        type="button"
        className={`inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border shadow-sm ${
          isDanger
            ? "border-danger/40 bg-danger/15 text-danger hover:bg-danger/25"
            : "border-warn/40 bg-warn/15 text-warn hover:bg-warn/25"
        }`}
        aria-label={notice.tooltip}
        data-testid="companion-inference-cloud-alert"
        onPointerDown={onPointerDown}
        onClick={onClick}
      >
        <AlertTriangle className="pointer-events-none h-5 w-5 shrink-0" />
      </button>
    </IconTooltip>
  );
});
