import { PermissionsOnboardingSection } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";

export function PermissionsStep() {
  const { handleOnboardingNext, handleOnboardingBack, t } = useApp();

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.systemAccessTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.15)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,255,255,0.15)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <PermissionsOnboardingSection
        onContinue={(options) => void handleOnboardingNext(options)}
        onBack={() => handleOnboardingBack()}
      />
    </>
  );
}
