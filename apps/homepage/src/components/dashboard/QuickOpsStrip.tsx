import { useState } from "react";
import { releaseData } from "../../generated/release-data";

const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/milady-ai/milady";

export interface QuickOpsStripProps {
  onCopy: (command: string, label: string) => void;
}

/**
 * Zone 3 — height-constrained strip. First-time user sees install + docs
 * links once, returning user ignores it. Three cards, collapses to stack
 * on mobile.
 */
export function QuickOpsStrip({ onCopy }: QuickOpsStripProps) {
  const [platform, setPlatform] = useState<"shell" | "powershell">("shell");
  const command =
    platform === "shell"
      ? releaseData.scripts.shell.command
      : releaseData.scripts.powershell.command;
  const label = platform === "shell" ? "Shell" : "PowerShell";
  const downloads = releaseData.release.downloads.slice(0, 3);

  return (
    <section aria-labelledby="quickops-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          id="quickops-heading"
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40"
        >
          get started
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          {releaseData.release.publishedAtLabel}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr]">
        {/* Install command */}
        <div className="rounded-lg border border-border bg-[#0a0a0d] p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              install
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
              <PlatformToggle
                active={platform === "shell"}
                onClick={() => setPlatform("shell")}
                label="shell"
              />
              <PlatformToggle
                active={platform === "powershell"}
                onClick={() => setPlatform("powershell")}
                label="pwsh"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-black/40 px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-brand">
              {command}
            </code>
            <button
              type="button"
              onClick={() => onCopy(command, label)}
              aria-label={`Copy ${label} install command`}
              className="shrink-0 rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/70 transition hover:border-white/25 hover:text-white"
            >
              copy
            </button>
          </div>
        </div>

        {/* Downloads */}
        <div className="rounded-lg border border-border bg-[#0a0a0d] p-4">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
            download
          </div>
          <div className="flex flex-col gap-1.5">
            {downloads.length === 0 ? (
              <span className="text-[12px] text-white/40">
                No desktop builds available yet.
              </span>
            ) : (
              downloads.map((download) => (
                <a
                  key={download.id}
                  href={download.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 py-2 text-[12px] text-white transition hover:border-white/25 hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {download.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/50">
                    {download.sizeLabel}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Docs + GitHub */}
        <div className="rounded-lg border border-border bg-[#0a0a0d] p-4">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
            resources
          </div>
          <div className="flex flex-col gap-1.5">
            <a
              href={DOCS_URL}
              className="flex items-center justify-between rounded-md border border-border bg-transparent px-3 py-2 text-[12px] text-white transition hover:border-white/25 hover:bg-white/[0.03]"
            >
              <span>Docs</span>
              <span aria-hidden="true" className="text-white/40">
                →
              </span>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md border border-border bg-transparent px-3 py-2 text-[12px] text-white transition hover:border-white/25 hover:bg-white/[0.03]"
            >
              <span>GitHub</span>
              <span aria-hidden="true" className="text-white/40">
                ↗
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
        active ? "bg-brand text-black" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
