import { Button } from "@miladyai/ui";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";

export function ConnectionHostingScreen({
  showHostingLocalCard,
  dispatch,
}: {
  showHostingLocalCard: boolean;
  dispatch: (event: ConnectionEvent) => void;
}) {
  const branding = useBranding();
  const { t, handleOnboardingBack } = useApp();

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.hostingTitle")}
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <div
        className="text-xl font-light leading-[1.4] text-[var(--onboarding-text-strong)] text-center mb-[18px]"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
        {t("onboarding.hostingQuestion", appNameInterpolationVars(branding))}
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        {showHostingLocalCard && (
          <Button
            type="button"
            className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-recommended-bg-hover)] hover:border-[var(--onboarding-recommended-border-strong)]"
            onClick={() => dispatch({ type: "selectLocalHosting" })}
          >
            <div className="min-w-0 flex-1">
              <div
                className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
              >
                {t("onboarding.hostingLocal")}
              </div>
              <div
                className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
              >
                {t("onboarding.hostingLocalDesc")}
              </div>
            </div>
            <span
              className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[var(--onboarding-accent-bg)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--onboarding-accent-foreground)]"
              style={{ textShadow: "0 1px 6px rgba(3,5,10,0.45)" }}
            >
              {t("onboarding.recommended") ?? "Recommended"}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          type="button"
          className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"
          onClick={() => dispatch({ type: "selectRemoteHosting" })}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
            >
              {t("onboarding.hostingRemote")}
            </div>
            <div
              className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
            >
              {t("onboarding.hostingRemoteDesc")}
            </div>
          </div>
        </Button>
        <Button
          variant="outline"
          type="button"
          className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"
          onClick={() => dispatch({ type: "selectElizaCloudHosting" })}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
            >
              {t("header.Cloud")}
            </div>
            <div
              className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
            >
              {t("onboarding.hostingElizaCloudDesc")}
            </div>
          </div>
        </Button>
      </div>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
        <Button
          variant="ghost"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
          onClick={handleOnboardingBack}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <span />
      </div>
    </>
  );
}
