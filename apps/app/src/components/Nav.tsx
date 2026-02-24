import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { TAB_GROUPS } from "../navigation";

interface NavProps {
  mobileLeft?: ReactNode;
}

export function Nav({ mobileLeft }: NavProps) {
  const { tab, setTab } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeGroup = useMemo(
    () => TAB_GROUPS.find((group) => group.tabs.includes(tab)) ?? TAB_GROUPS[0],
    [tab],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <nav className="border-b border-border py-2 px-3 sm:px-5 flex gap-1 overflow-x-auto" aria-label="Main navigation">
      {TAB_GROUPS.map((group: (typeof TAB_GROUPS)[number]) => {
        const primaryTab = group.tabs[0];
        const isActive = group.tabs.includes(tab);
        return (
          <button
            key={group.label}
            className={`inline-block whitespace-nowrap px-3 py-1.5 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              isActive
                ? "text-accent font-medium border-b-accent"
                : "text-muted border-b-transparent hover:text-txt"
            }`}
            onClick={() => setTab(primaryTab)}
            aria-current={isActive ? "page" : undefined}
          >
            <title>Menu</title>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </nav>

      <nav className="hidden lg:flex border-b border-border py-1.5 px-3 xl:px-5 gap-0.5 overflow-x-auto whitespace-nowrap">
        {TAB_GROUPS.map((group: (typeof TAB_GROUPS)[number]) => {
          const primaryTab = group.tabs[0];
          const isActive = group.tabs.includes(tab);
          return (
            <button
              type="button"
              key={group.label}
              className={`inline-block shrink-0 px-2 xl:px-3 py-1 text-[12px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
                isActive
                  ? "text-accent font-medium border-b-accent"
                  : "text-muted border-b-transparent hover:text-txt"
              }`}
              onClick={() => setTab(primaryTab)}
            >
              {group.label}
            </button>
          );
        })}
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[140] bg-bg lg:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-xs uppercase tracking-wide text-muted">
              Navigation
            </span>
            <button
              type="button"
              className="inline-flex items-center justify-center w-9 h-9 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent transition-colors"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              &times;
            </button>
          </div>
          <div className="p-3 overflow-y-auto">
            <div className="flex flex-col gap-2">
              {TAB_GROUPS.map((group: (typeof TAB_GROUPS)[number]) => {
                const primaryTab = group.tabs[0];
                const isActive = group.tabs.includes(tab);
                return (
                  <button
                    key={group.label}
                    type="button"
                    className={`w-full text-left px-3 py-3 border rounded-md text-[14px] font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-border bg-card text-txt hover:border-accent hover:text-accent"
                    }`}
                    onClick={() => setTab(primaryTab)}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
