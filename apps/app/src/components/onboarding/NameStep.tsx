import { useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function NameStep() {
  const {
    t,
    onboardingOptions,
    onboardingName,
    onboardingAvatar,
    customVrmUrl,
    setState,
  } = useApp();

  const [customNameText, setCustomNameText] = useState("");
  const [isCustomSelected, setIsCustomSelected] = useState(false);

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
          {t("onboarding.nameQuestion")}
        </h2>
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-accent border border-accent/40 px-1.5 py-0.5 rounded mt-1">
          * {t("onboarding.required")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mx-auto mb-3">
        {onboardingOptions?.names.slice(0, 6).map((name: string) => (
          <button
            type="button"
            key={name}
            className={`px-5 py-2 border cursor-pointer bg-card transition-colors rounded-full text-sm font-bold ${
              onboardingName === name && !isCustomSelected
                ? "border-accent !bg-accent !text-accent-fg"
                : "border-border hover:border-accent"
            }`}
            onClick={() => {
              setState("onboardingName", name);
              setIsCustomSelected(false);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="max-w-[260px] mx-auto">
        <div
          className={`px-4 py-2.5 border cursor-text bg-card transition-colors rounded-full ${
            isCustomSelected
              ? "border-accent ring-2 ring-accent/30"
              : "border-border hover:border-accent"
          }`}
        >
          <input
            type="text"
            value={customNameText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setCustomNameText(e.target.value);
              setState("onboardingName", e.target.value);
              setIsCustomSelected(true);
            }}
            onFocus={() => {
              setIsCustomSelected(true);
              setState("onboardingName", customNameText);
            }}
            className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-txt text-center placeholder:text-muted"
            placeholder={t("onboarding.customNamePlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
