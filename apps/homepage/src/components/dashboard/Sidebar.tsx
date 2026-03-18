const SECTIONS = [
  { id: "agents", label: "Agents", icon: "\u25C9" },
  { id: "metrics", label: "Metrics", icon: "\u25EB" },
  { id: "logs", label: "Logs", icon: "\u25FB" },
  { id: "export", label: "Export", icon: "\u2913" },
  { id: "billing", label: "Billing", icon: "\u25C8" },
] as const;

export type DashboardSection = (typeof SECTIONS)[number]["id"];

interface SidebarProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-48 min-h-screen border-r border-white/10 pt-24 px-4 flex-shrink-0">
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`w-full text-left px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors duration-200 rounded ${
                active === s.id
                  ? "text-brand bg-brand/10"
                  : "text-text-muted hover:text-text-light hover:bg-white/5"
              }`}
            >
              <span className="mr-2">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-white/10 pt-20 px-2 gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex-shrink-0 px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              active === s.id
                ? "text-brand border-b-2 border-brand"
                : "text-text-muted"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>
    </>
  );
}
