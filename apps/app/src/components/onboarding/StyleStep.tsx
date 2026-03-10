import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import type { StylePreset } from "../../api-client";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function StyleStep() {
  const {
    t,
    onboardingOptions,
    onboardingStyle,
    onboardingAvatar,
    customVrmUrl,
    setState,
  } = useApp();

  const handleStyleSelect = (catchphrase: string) => {
    setState("onboardingStyle", catchphrase);
  };

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  return (
    <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboarding.styleQuestion")}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mx-auto max-w-[480px]">
        {onboardingOptions?.styles.map((preset: StylePreset) => (
          <button
            type="button"
            key={preset.catchphrase}
            className={`px-3 py-3 border cursor-pointer bg-card transition-colors text-center rounded-lg ${
              onboardingStyle === preset.catchphrase
                ? "border-accent !bg-accent !text-accent-fg"
                : "border-border hover:border-accent"
            }`}
            onClick={() => handleStyleSelect(preset.catchphrase)}
          >
            <div className="font-bold text-sm">{preset.catchphrase}</div>
            <div
              className={`text-[11px] mt-0.5 ${
                onboardingStyle === preset.catchphrase
                  ? "text-accent-fg/70"
                  : "text-muted"
              }`}
            >
              {preset.hint}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
