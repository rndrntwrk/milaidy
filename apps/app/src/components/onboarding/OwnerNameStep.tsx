import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function OwnerNameStep() {
  const { t, onboardingOwnerName, onboardingAvatar, customVrmUrl, setState } =
    useApp();

  const ownerPresets = ["anon", "master", "senpai", "bestie", "boss"];
  const isOwnerCustom = ownerPresets.indexOf(onboardingOwnerName) === -1;

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
          {t("onboarding.ownerQuestion")}
        </h2>
        <p className="text-[13px] opacity-60 mt-1">
          {t("onboarding.optionalOwnerHint")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mx-auto mb-3">
        {ownerPresets.map((preset) => (
          <button
            type="button"
            key={preset}
            className={`px-5 py-2 border cursor-pointer bg-card transition-colors rounded-full text-sm font-bold ${
              onboardingOwnerName === preset
                ? "border-accent !bg-accent !text-accent-fg"
                : "border-border hover:border-accent"
            }`}
            onClick={() => setState("onboardingOwnerName", preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="max-w-[260px] mx-auto">
        <div
          className={`px-4 py-2.5 border cursor-text bg-card transition-colors rounded-full ${
            isOwnerCustom && onboardingOwnerName
              ? "border-accent ring-2 ring-accent/30"
              : "border-border hover:border-accent"
          }`}
        >
          <input
            type="text"
            value={isOwnerCustom ? onboardingOwnerName : ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setState("onboardingOwnerName", e.target.value);
            }}
            onFocus={() => {
              if (!isOwnerCustom) setState("onboardingOwnerName", "");
            }}
            className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-txt text-center placeholder:text-muted"
            placeholder={t("onboarding.customOwnerPlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
