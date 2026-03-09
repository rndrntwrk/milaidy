import { useEffect, useState } from "react";
import { client, type AutonomyApproval } from "../api-client.js";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";

export function MissionQueuePanel() {
  const { triggers, loadTriggers, runTriggerNow, setTab } = useApp();
  const [approvals, setApprovals] = useState<AutonomyApproval[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchMissions = async () => {
      try {
        const res = await client.getApprovals();
        if (mounted) setApprovals(res.pending || []);
      } catch (err) {
        console.error("Failed to fetch approvals", err);
      }
    };

    void fetchMissions();
    void loadTriggers();

    const interval = setInterval(fetchMissions, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadTriggers]);

  const nextTrigger = triggers.find((trigger) => trigger.enabled);

  return (
    <Card className="h-full border-white/10 bg-black/32 shadow-none">
      <CardHeader className="border-b border-white/8 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Mission Stack</CardTitle>
          <Badge variant="outline">
            {approvals.length > 0
              ? "awaiting approval"
              : nextTrigger
                ? "queued"
                : "idle"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-white/55">
            <div>Active</div>
            <div className="mt-1 text-sm text-white/86">
              {approvals.length > 0 ? "Review" : nextTrigger ? "Queued" : "Idle"}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-white/55">
            <div>Approvals</div>
            <div className="mt-1 text-sm text-white/86">{approvals.length}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-white/55">
            <div>Next</div>
            <div className="mt-1 truncate text-sm text-white/86">
              {nextTrigger?.displayName ?? "None"}
            </div>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto">
          {approvals.slice(0, 2).map((approval) => (
            <div key={approval.id} className="rounded-2xl border border-warn/20 bg-warn/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="warning">Approval</Badge>
                <span className="truncate text-[11px] uppercase tracking-[0.18em] text-white/48" title={approval.toolName}>
                  {approval.toolName}
                </span>
              </div>
              <div className="mb-3 text-sm text-white/74">Human review is blocking the next step.</div>
              <Button variant="secondary" size="sm" onClick={() => setTab("approvals")}>Review</Button>
            </div>
          ))}

          {triggers.slice(0, 4).map((trigger) => (
            <div key={trigger.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white/86" title={trigger.displayName}>
                    {trigger.displayName}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/42">
                    {trigger.enabled ? "Ready to run" : trigger.triggerType}
                  </div>
                </div>
                <Badge variant={trigger.enabled ? "success" : "outline"}>
                  {trigger.enabled ? "active" : "idle"}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setTab("triggers")}>Open</Button>
                {trigger.enabled ? (
                  <Button variant="secondary" size="sm" onClick={() => void runTriggerNow(trigger.id)}>
                    Run
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

          {approvals.length === 0 && triggers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-center text-sm text-white/42">
              No queued interventions.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
