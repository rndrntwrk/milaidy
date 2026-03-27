import {
  onboardingCardSurfaceClassName,
  onboardingCardSurfaceHoverClassName,
  onboardingReadableTextFaintClassName,
  onboardingReadableTextStrongClassName,
} from "./onboarding-form-primitives";

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
    <div
      className={`mx-auto mb-4 flex w-fit items-center gap-[4px] rounded-[8px] p-[3px] backdrop-blur-[12px] ${onboardingCardSurfaceClassName}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative px-[20px] py-[7px] rounded-[6px] text-[11px] font-semibold tracking-[0.14em] uppercase cursor-pointer transition-all duration-300 border-none outline-none ${
              isActive
                ? `bg-[var(--onboarding-accent-bg)] shadow-[0_0_8px_rgba(240,185,11,0.12)] ${onboardingReadableTextStrongClassName}`
                : `bg-transparent hover:text-[var(--onboarding-link)] ${onboardingReadableTextFaintClassName} ${onboardingCardSurfaceHoverClassName}`
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
