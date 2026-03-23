/** Glassmorphic pill-style tab switcher for onboarding panels. */
export function OnboardingTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-[4px] p-[3px] rounded-[8px] bg-[var(--onboarding-card-bg)] backdrop-blur-[12px] border border-[var(--onboarding-card-border)] w-fit mx-auto mb-4">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative px-[20px] py-[7px] rounded-[6px] text-[11px] font-semibold tracking-[0.14em] uppercase cursor-pointer transition-all duration-300 border-none outline-none ${
              isActive
                ? "bg-[var(--onboarding-accent-bg)] text-[var(--onboarding-text-strong)] shadow-[0_0_8px_rgba(240,185,11,0.12)]"
                : "bg-transparent text-[var(--onboarding-text-faint)] hover:text-[var(--onboarding-link)] hover:bg-[var(--onboarding-card-bg-hover)]"
            }`}
            style={{ textShadow: "0 1px 6px rgba(3,5,10,0.5)" }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
