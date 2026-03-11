import { DrawerShell } from "./DrawerShell.js";
import { MemoryConsolePanel } from "./MemoryConsolePanel.js";
import { Sheet } from "./ui/Sheet.js";
import { MemoryIcon } from "./ui/Icons.js";

export function MemoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} side="left" className="w-[min(36rem,100vw)]">
      <DrawerShell
        icon={<MemoryIcon width="14" height="14" />}
        title="Memory"
        description="Search memory and ingest state."
        onClose={onClose}
      >
          <MemoryConsolePanel />
      </DrawerShell>
    </Sheet>
  );
}
