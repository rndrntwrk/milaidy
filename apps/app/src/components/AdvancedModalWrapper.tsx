import React from "react";
import { AdvancedPageView } from "./AdvancedPageView.js";
import { useApp } from "../AppContext.js";
import { Dialog } from "./ui/Dialog.js";
import { CloseIcon, StackIcon } from "./ui/Icons.js";

const ADVANCED_TABS = [
    "plugins", "skills", "actions", "triggers", "identity",
    "approvals", "safe-mode", "governance", "fine-tuning",
    "trajectories", "runtime", "database", "logs", "security"
];

export function AdvancedModalWrapper() {
  const { tab, setTab } = useApp();
  if (!ADVANCED_TABS.includes(tab)) return null;

  return (
    <Dialog open={ADVANCED_TABS.includes(tab)} onClose={() => setTab("chat")} ariaLabelledBy="advanced-modal-title">
      <div className="w-[min(96vw,110rem)] h-[94vh] overflow-hidden rounded-[32px] border border-white/10 bg-[rgba(10,10,12,0.95)] text-white shadow-[0_32px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
              <StackIcon width="18" height="18" />
            </div>
            <div>
              <div id="advanced-modal-title" className="text-sm font-semibold uppercase tracking-[0.22em] text-white/88">
                Control Stack
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/48">
                Section: {tab}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab("chat")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/58 transition-colors hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
            aria-label="Close control stack"
          >
            <CloseIcon width="16" height="16" />
          </button>
        </div>
        <div className="flex h-[calc(94vh-4.5rem)] min-h-0 flex-col overflow-hidden">
          <AdvancedPageView />
        </div>
      </div>
    </Dialog>
  );
}
