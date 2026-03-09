import { Button } from "./ui/Button.js";
import { MemoryIcon, OpsIcon, StackIcon, ThreadsIcon, VaultIcon } from "./ui/Icons.js";

interface CommandDockProps {
  activeSurface?: "none" | "threads" | "memory" | "ops" | "vault" | "control-stack";
  onOpenThreads?: () => void;
  onOpenMemory?: () => void;
  onOpenOps?: () => void;
  onOpenVault?: () => void;
  onOpenControlStack?: () => void;
}

function variantFor(active: boolean): "outline" | "secondary" {
  return active ? "secondary" : "outline";
}

export function CommandDock({
  activeSurface = "none",
  onOpenThreads,
  onOpenMemory,
  onOpenOps,
  onOpenVault,
  onOpenControlStack,
}: CommandDockProps) {
  const mobileLabelClass = "hidden sm:inline";

  return (
    <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/62 px-1.5 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:gap-3 sm:px-3 sm:py-2">
      <Button variant={variantFor(activeSurface === "threads")} size="sm" onClick={onOpenThreads} aria-label="Open threads">
        <ThreadsIcon className="h-4 w-4" />
        <span className={mobileLabelClass}>Threads</span>
      </Button>
      <Button variant={variantFor(activeSurface === "memory")} size="sm" onClick={onOpenMemory} aria-label="Open memory">
        <MemoryIcon className="h-4 w-4" />
        <span className={mobileLabelClass}>Memory</span>
      </Button>
      <Button variant={variantFor(activeSurface === "ops")} size="sm" onClick={onOpenOps} aria-label="Open operations">
        <OpsIcon className="h-4 w-4" />
        <span className={mobileLabelClass}>Ops</span>
      </Button>
      <Button variant={variantFor(activeSurface === "vault")} size="sm" onClick={onOpenVault} aria-label="Open vault">
        <VaultIcon className="h-4 w-4" />
        <span className={mobileLabelClass}>Vault</span>
      </Button>
      <div className="hidden h-6 w-px bg-white/10 sm:block" />
      <Button variant={activeSurface === "control-stack" ? "default" : "secondary"} size="sm" onClick={onOpenControlStack} aria-label="Open control stack">
        <StackIcon className="h-4 w-4" />
        <span className={mobileLabelClass}>Control Stack</span>
      </Button>
    </div>
  );
}
