import { SecurityAuditView } from "./SecurityAuditView";

export function SecurityAuditPageView() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <SecurityAuditView />
      </div>
    </div>
  );
}
