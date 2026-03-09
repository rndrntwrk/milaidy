import React from "react";
import { SettingsView } from "./SettingsView.js";
import { useApp } from "../AppContext.js";
import { Dialog } from "./ui/Dialog.js";
import { CloseIcon, SettingsIcon } from "./ui/Icons.js";

export function SettingsModalWrapper() {
  const { tab, setTab } = useApp();
  if (tab !== "settings") return null;

  return (
    <Dialog open={tab === "settings"} onClose={() => setTab("chat")} ariaLabelledBy="settings-modal-title">
      <div className="w-[min(72rem,96vw)] max-h-[90vh] overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(10,10,12,0.94)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
              <SettingsIcon width="18" height="18" />
            </div>
            <div>
              <div id="settings-modal-title" className="text-sm font-semibold uppercase tracking-[0.22em] text-white/88">
                System Preferences
              </div>
              <div className="mt-1 text-xs text-white/48">
                Unified settings surface for the conversation workspace.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab("chat")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/58 transition-colors hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
            aria-label="Close settings"
          >
            <CloseIcon width="16" height="16" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-4.5rem)] overflow-y-auto px-5 py-5">
          <SettingsView />
        </div>
      </div>
    </Dialog>
  );
}
