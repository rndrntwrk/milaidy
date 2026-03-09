import { SecurityAuditView } from "./SecurityAuditView";
import { ControlStackSectionFrame } from "./ControlStackSectionFrame.js";

export function SecurityAuditPageView() {
  return (
    <ControlStackSectionFrame
      title="Security"
      description="Sandbox, policy, signing, and trust-state audit events with a calmer operational shell."
      badge="Audit"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/45">
          Security event stream
        </div>
        <div className="min-h-0 flex-1">
          <SecurityAuditView />
        </div>
      </div>
    </ControlStackSectionFrame>
  );
}
