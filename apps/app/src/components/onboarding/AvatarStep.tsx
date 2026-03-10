import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { client } from "../../api-client";
import { resolveApiUrl } from "../../asset-url";
import { AvatarSelector } from "../AvatarSelector";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function AvatarStep() {
  const { t, onboardingAvatar, customVrmUrl, setState } = useApp();

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  return (
    <div className="mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboarding.avatarQuestion")}
        </h2>
      </div>
      <div className="mx-auto">
        <AvatarSelector
          selected={onboardingAvatar}
          onSelect={(i) => setState("onboardingAvatar", i)}
          onUpload={(file) => {
            const previousAvatar = onboardingAvatar;
            const url = URL.createObjectURL(file);
            setState("customVrmUrl", url);
            setState("onboardingAvatar", 0);
            client
              .uploadCustomVrm(file)
              .then(() => {
                setState(
                  "customVrmUrl",
                  resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
                );
                requestAnimationFrame(() => URL.revokeObjectURL(url));
              })
              .catch(() => {
                setState("onboardingAvatar", previousAvatar);
                URL.revokeObjectURL(url);
              });
          }}
          showUpload
        />
      </div>
    </div>
  );
}
