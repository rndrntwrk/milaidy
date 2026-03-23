import { LanguageDropdown } from "@miladyai/app-core/components";
import type { UiLanguage } from "@miladyai/app-core/i18n";
import { normalizeLanguage } from "@miladyai/app-core/i18n";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "@miladyai/app-core/state";
import { resolveAppAssetUrl } from "@miladyai/app-core/utils";
import { useEffect, useMemo, useState } from "react";
import { useBranding } from "../config/branding";
import { COMPANION_ENABLED } from "../navigation";
import { VrmStage } from "./companion/VrmStage";
import { ActivateStep } from "./onboarding/ActivateStep";
import { ConnectionStep } from "./onboarding/ConnectionStep";
import { OnboardingPanel } from "./onboarding/OnboardingPanel";
import { OnboardingStepNav } from "./onboarding/OnboardingStepNav";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { WelcomeStep } from "./onboarding/WelcomeStep";

const FORCE_VRM =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("test_force_vrm") === "1";

const DISABLE_ONBOARDING_VRM =
  !FORCE_VRM &&
  (String(import.meta.env.VITE_E2E_DISABLE_VRM ?? "").toLowerCase() ===
    "true" ||
    String(import.meta.env.VITE_E2E_DISABLE_VRM ?? "") === "1");

export function OnboardingWizard() {
  const branding = useBranding();
  const isEliza = branding.appName === "Eliza";
  const disableVrm =
    !FORCE_VRM && (DISABLE_ONBOARDING_VRM || isEliza || !COMPANION_ENABLED);
  const {
    onboardingStep,
    selectedVrmIndex,
    customVrmUrl,
    uiLanguage,
    uiTheme,
    setState,
    t,
    onboardingUiRevealNonce,
    companionVrmPowerMode,
    companionHalfFramerateMode,
    companionAnimateWhenHidden,
  } = useApp();
  // After Reset Agent from chat/companion, nonce bumps: show welcome UI immediately instead
  // of waiting for VrmStage reveal (often missing when remounting after an active session).
  const [revealStarted, setRevealStarted] = useState(
    () => disableVrm || onboardingUiRevealNonce > 0,
  );

  const setUiLanguage = (lang: UiLanguage) =>
    setState("uiLanguage", normalizeLanguage(lang));

  // Use same VRM resolution logic as CompanionView for character unification
  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreview =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const isDarkTheme = uiTheme === "dark";
  const worldUrl = resolveAppAssetUrl(
    isDarkTheme ? "worlds/companion-night.spz" : "worlds/companion-day.spz",
  );
  const onboardingThemeStyle = useMemo(
    () =>
      ({
        "--text": isDarkTheme
          ? "rgba(240,238,250,0.94)"
          : "rgba(30,35,41,0.94)",
        "--muted": isDarkTheme
          ? "rgba(240,238,250,0.66)"
          : "rgba(53,60,68,0.68)",
        "--border": isDarkTheme
          ? "rgba(255,255,255,0.14)"
          : "rgba(140,112,46,0.18)",
        "--card": isDarkTheme
          ? "rgba(10,14,20,0.28)"
          : "rgba(255,252,244,0.76)",
        "--ok": isDarkTheme ? "#56d39b" : "#0f8a56",
        "--ok-muted": isDarkTheme
          ? "rgba(86,211,155,0.34)"
          : "rgba(15,138,86,0.24)",
        "--ok-subtle": isDarkTheme
          ? "rgba(86,211,155,0.12)"
          : "rgba(15,138,86,0.1)",
        "--accent": "#f0b90b",
        "--accent-foreground": "#1a1f26",
        "--danger": isDarkTheme ? "rgb(248,113,113)" : "rgb(220,38,38)",
        "--onboarding-panel-bg": isDarkTheme
          ? "rgba(10,14,20,0.26)"
          : "rgba(238,244,247,0.34)",
        "--onboarding-panel-border": isDarkTheme
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.3)",
        "--onboarding-panel-shadow": isDarkTheme
          ? "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 18px 44px rgba(29,35,42,0.18), inset 0 1px 0 rgba(255,255,255,0.42)",
        "--onboarding-divider": isDarkTheme
          ? "rgba(255,255,255,0.15)"
          : "rgba(140,112,46,0.18)",
        "--onboarding-footer-border": isDarkTheme
          ? "rgba(255,255,255,0.08)"
          : "rgba(140,112,46,0.18)",
        "--onboarding-card-bg": isDarkTheme
          ? "rgba(10,14,20,0.26)"
          : "rgba(238,244,247,0.34)",
        "--onboarding-card-bg-hover": isDarkTheme
          ? "rgba(10,14,20,0.34)"
          : "rgba(243,248,250,0.46)",
        "--onboarding-card-border": isDarkTheme
          ? "rgba(255,255,255,0.16)"
          : "rgba(255,255,255,0.22)",
        "--onboarding-card-border-strong": isDarkTheme
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.36)",
        "--onboarding-recommended-bg": isDarkTheme
          ? "rgba(240,185,11,0.1)"
          : "rgba(240,185,11,0.16)",
        "--onboarding-recommended-bg-hover": isDarkTheme
          ? "rgba(240,185,11,0.14)"
          : "rgba(240,185,11,0.22)",
        "--onboarding-recommended-border": isDarkTheme
          ? "rgba(240,185,11,0.24)"
          : "rgba(184,137,45,0.34)",
        "--onboarding-recommended-border-strong": isDarkTheme
          ? "rgba(240,185,11,0.4)"
          : "rgba(184,137,45,0.48)",
        "--onboarding-detected-bg": isDarkTheme
          ? "rgba(34,197,94,0.1)"
          : "rgba(16,185,129,0.12)",
        "--onboarding-detected-bg-hover": isDarkTheme
          ? "rgba(34,197,94,0.15)"
          : "rgba(16,185,129,0.18)",
        "--onboarding-detected-border": isDarkTheme
          ? "rgba(34,197,94,0.4)"
          : "rgba(16,185,129,0.34)",
        "--onboarding-detected-border-strong": isDarkTheme
          ? "rgba(34,197,94,0.5)"
          : "rgba(16,185,129,0.48)",
        "--onboarding-text-strong": isDarkTheme
          ? "rgba(240,238,250,0.95)"
          : "rgba(30,35,41,0.95)",
        "--onboarding-text-primary": isDarkTheme
          ? "rgba(240,238,250,0.92)"
          : "rgba(30,35,41,0.92)",
        "--onboarding-text-muted": isDarkTheme
          ? "rgba(240,238,250,0.68)"
          : "rgba(53,60,68,0.72)",
        "--onboarding-text-subtle": isDarkTheme
          ? "rgba(240,238,250,0.58)"
          : "rgba(83,91,100,0.66)",
        "--onboarding-text-faint": isDarkTheme
          ? "rgba(240,238,250,0.42)"
          : "rgba(83,91,100,0.5)",
        "--onboarding-link": isDarkTheme
          ? "rgba(240,238,250,0.72)"
          : "rgba(113,84,16,0.92)",
        "--onboarding-link-hover": isDarkTheme
          ? "rgba(240,238,250,0.95)"
          : "rgba(78,58,12,0.98)",
        "--onboarding-text-shadow-strong": isDarkTheme
          ? "0 2px 10px rgba(3,5,10,0.55)"
          : "0 1px 0 rgba(255,255,255,0.56)",
        "--onboarding-text-shadow-soft": isDarkTheme
          ? "0 1px 8px rgba(3,5,10,0.45)"
          : "0 1px 0 rgba(255,255,255,0.44)",
        "--onboarding-button-text-shadow": isDarkTheme
          ? "0 1px 6px rgba(3,5,10,0.38)"
          : "none",
        "--onboarding-glow-title": isDarkTheme
          ? "0 0 30px rgba(240,185,11,0.3), 0 2px 12px rgba(3,5,10,0.65)"
          : "0 10px 26px rgba(240,185,11,0.16), 0 1px 0 rgba(255,255,255,0.6)",
        "--onboarding-accent-bg": isDarkTheme
          ? "rgba(240,185,11,0.18)"
          : "rgba(240,185,11,0.2)",
        "--onboarding-accent-bg-hover": isDarkTheme
          ? "rgba(240,185,11,0.28)"
          : "rgba(240,185,11,0.28)",
        "--onboarding-accent-border": isDarkTheme
          ? "rgba(240,185,11,0.35)"
          : "rgba(184,137,45,0.38)",
        "--onboarding-accent-border-hover": isDarkTheme
          ? "rgba(240,185,11,0.6)"
          : "rgba(184,137,45,0.52)",
        "--onboarding-accent-foreground": "#1a1f26",
        "--onboarding-ripple": "rgba(240,185,11,0.3)",
        "--onboarding-field-bg": isDarkTheme
          ? "rgba(10,14,20,0.26)"
          : "rgba(238,244,247,0.34)",
        "--onboarding-field-border": isDarkTheme
          ? "rgba(255,255,255,0.16)"
          : "rgba(255,255,255,0.22)",
        "--onboarding-field-focus-border": isDarkTheme
          ? "rgba(240,185,11,0.4)"
          : "rgba(184,137,45,0.46)",
        "--onboarding-field-focus-shadow": isDarkTheme
          ? "0 0 12px rgba(240,185,11,0.08)"
          : "0 0 0 3px rgba(240,185,11,0.08)",
        "--onboarding-roster-bg": isDarkTheme
          ? "rgba(0,0,0,0.5)"
          : "rgba(255,248,231,0.78)",
        "--onboarding-roster-border": isDarkTheme
          ? "rgba(255,255,255,0.05)"
          : "rgba(140,112,46,0.12)",
        "--onboarding-nav-scrim": isDarkTheme
          ? "linear-gradient(180deg, rgba(6,9,15,0.72), rgba(6,9,15,0.44))"
          : "linear-gradient(180deg, rgba(6,9,15,0.78), rgba(6,9,15,0.5))",
        "--onboarding-nav-border": "rgba(255,255,255,0.12)",
        "--onboarding-nav-shadow":
          "0 24px 56px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
        "--onboarding-nav-text-strong": "rgba(240,238,250,0.94)",
        "--onboarding-nav-text-primary": "rgba(240,238,250,0.88)",
        "--onboarding-nav-text-subtle": "rgba(240,238,250,0.62)",
        "--onboarding-nav-text-faint": "rgba(240,238,250,0.42)",
        "--onboarding-nav-link": "rgba(240,238,250,0.76)",
        "--onboarding-nav-link-hover": "rgba(240,238,250,0.94)",
        "--onboarding-nav-card-bg": "rgba(9,12,18,0.78)",
        "--onboarding-nav-card-border": "rgba(255,255,255,0.14)",
        "--onboarding-overlay-accent": isDarkTheme
          ? "rgba(240,185,11,0.18)"
          : "rgba(184,137,45,0.2)",
        "--onboarding-overlay-fill": isDarkTheme
          ? "rgba(240,185,11,0.25)"
          : "rgba(184,137,45,0.28)",
      }) as React.CSSProperties,
    [isDarkTheme],
  );
  const fallbackOverlayStyle = useMemo<React.CSSProperties>(
    () => ({
      background: isDarkTheme
        ? "radial-gradient(circle at 50% 25%, rgba(255,255,255,0.16), transparent 34%), linear-gradient(180deg, rgba(17,17,17,0.08), rgba(10,10,10,0.36))"
        : "radial-gradient(circle at 50% 22%, rgba(255,255,255,0.72), transparent 34%), linear-gradient(180deg, rgba(255,247,225,0.22), rgba(240,226,188,0.56))",
    }),
    [isDarkTheme],
  );

  // Overlay stays opacity 0 until VrmStage calls onRevealStart. After Reset Milady (or
  // any remount), the engine sometimes never emits reveal — user sees only the avatar.
  useEffect(() => {
    if (disableVrm) return;
    const id = window.setTimeout(() => {
      setRevealStarted((prev) => (prev ? prev : true));
    }, 3500);
    return () => window.clearTimeout(id);
  }, [disableVrm]);

  function renderStep() {
    switch (onboardingStep) {
      case "welcome":
        return <WelcomeStep />;
      case "hosting":
      case "providers":
        return <ConnectionStep />;
      case "permissions":
        return <PermissionsStep />;
      case "launch":
        return <ActivateStep />;
      default:
        return null;
    }
  }

  return (
    <div
      className="w-screen h-screen bg-transparent relative overflow-hidden"
      style={onboardingThemeStyle}
    >
      {/* Keep browser E2E runs lightweight and deterministic by skipping VRM boot. */}
      {disableVrm ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 pointer-events-none"
          style={fallbackOverlayStyle}
        />
      ) : (
        <VrmStage
          vrmPath={vrmPath}
          worldUrl={worldUrl}
          fallbackPreviewUrl={fallbackPreview}
          cameraProfile="companion"
          initialCompanionZoomNormalized={1}
          companionVrmPowerMode={companionVrmPowerMode}
          companionHalfFramerateMode={companionHalfFramerateMode}
          companionAnimateWhenHidden={companionAnimateWhenHidden}
          onRevealStart={() => setRevealStarted((prev) => (prev ? prev : true))}
          t={t}
        />
      )}

      <div
        data-testid="onboarding-ui-overlay"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: revealStarted ? 1 : 0,
          transition: "opacity 1.2s ease-in-out",
          zIndex: 40,
        }}
      >
        {/* Corner decorations */}
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 top-5 left-5 onboarding-corner-anim"
          viewBox="0 0 36 36"
          fill="none"
          stroke="var(--onboarding-overlay-accent)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="var(--onboarding-overlay-fill)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 top-5 right-5 -scale-x-100 onboarding-corner-anim"
          style={{ animationDelay: "1s" }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="var(--onboarding-overlay-accent)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="var(--onboarding-overlay-fill)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 bottom-5 left-5 -scale-y-100 onboarding-corner-anim"
          style={{ animationDelay: "2s" }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="var(--onboarding-overlay-accent)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="var(--onboarding-overlay-fill)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 bottom-5 right-5 -scale-100 onboarding-corner-anim"
          style={{ animationDelay: "3s" }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="var(--onboarding-overlay-accent)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="var(--onboarding-overlay-fill)"
            stroke="none"
          />
        </svg>

        {/* Language selector — top right */}
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            zIndex: 50,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant="companion"
          />
        </div>

        {/* ── Standard overlaid UI — step nav + content panel ── */}
        <div className="absolute inset-0 z-20 flex justify-between pointer-events-none [&>*]:pointer-events-auto max-md:flex-col max-md:justify-end max-md:gap-0">
          <OnboardingStepNav />
          <OnboardingPanel step={onboardingStep}>
            {renderStep()}
          </OnboardingPanel>
        </div>
      </div>
    </div>
  );
}
