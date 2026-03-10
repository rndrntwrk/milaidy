/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useState } from "react";
import { type OnboardingStep, useApp } from "../AppContext";
import { AvatarStep } from "./onboarding/AvatarStep";
import { CloudLoginStep } from "./onboarding/CloudLoginStep";
import { CloudProviderStep } from "./onboarding/CloudProviderStep";
import { ConnectorsStep } from "./onboarding/ConnectorsStep";
import { InventorySetupStep } from "./onboarding/InventorySetupStep";
import { LanguageStep } from "./onboarding/LanguageStep";
import { LlmProviderStep } from "./onboarding/LlmProviderStep";
import { ModelSelectionStep } from "./onboarding/ModelSelectionStep";
import { NameStep } from "./onboarding/NameStep";
import { OwnerNameStep } from "./onboarding/OwnerNameStep";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { RunModeStep } from "./onboarding/RunModeStep";
import { SetupModeStep } from "./onboarding/SetupModeStep";
import { StyleStep } from "./onboarding/StyleStep";
import { WelcomeStep } from "./onboarding/WelcomeStep";

// Platform detection for mobile — on iOS/Android only cloud mode is available
export function OnboardingWizard() {
  const {
    onboardingStep,
    onboardingName,
    onboardingSetupMode,
    onboardingStyle,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingElizaCloudTab,
    onboardingRestarting,
    cloudConnected,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
    t,
  } = useApp();

  const [_showAllProviders, _setShowAllProviders] = useState(false);

  // ── Step progress helpers ────────────────────────────────────────────
  const QUICK_STEPS: OnboardingStep[] = [
    "welcome",
    "language",
    "ownerName",
    "setupMode",
    "llmProvider",
    "permissions",
  ];
  const FULL_STEPS: OnboardingStep[] = [
    "welcome",
    "language",
    "ownerName",
    "setupMode",
    "runMode",
    "cloudProvider",
    "modelSelection",
    "cloudLogin",
    "llmProvider",
    "inventorySetup",
    "connectors",
    "permissions",
  ];

  const getStepIndex = (): number => {
    const list = onboardingSetupMode === "advanced" ? FULL_STEPS : QUICK_STEPS;
    const idx = list.indexOf(onboardingStep as OnboardingStep);
    return idx === -1 ? 1 : idx + 1;
  };

  const getTotalSteps = (): number | null => {
    if (!onboardingSetupMode) return null;
    return onboardingSetupMode === "advanced"
      ? FULL_STEPS.length
      : QUICK_STEPS.length;
  };

  const stepIndex = getStepIndex();
  const totalSteps = getTotalSteps();
  const progressPct =
    totalSteps != null
      ? Math.round((stepIndex / totalSteps) * 100)
      : Math.round((stepIndex / QUICK_STEPS.length) * 100);

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      case "welcome":
        return <WelcomeStep />;
      case "language":
        return <LanguageStep />;
      case "name":
        return <NameStep />;
      case "ownerName":
        return <OwnerNameStep />;
      case "avatar":
        return <AvatarStep />;
      case "style":
        return <StyleStep />;
      case "setupMode":
        return <SetupModeStep />;
      case "runMode":
        return <RunModeStep />;
      case "cloudProvider":
        return <CloudProviderStep />;
      case "modelSelection":
        return <ModelSelectionStep />;
      case "cloudLogin":
        return <CloudLoginStep />;
      case "llmProvider":
        return <LlmProviderStep />;
      case "inventorySetup":
        return <InventorySetupStep />;
      case "connectors":
        return <ConnectorsStep />;
      case "permissions":
        return <PermissionsStep />;
      default:
        return null;
    }
  };

  const canGoNext = () => {
    switch (onboardingStep) {
      case "welcome":
        return true;
      case "name":
        return onboardingName.trim().length > 0;
      case "ownerName":
        return true; // optional — user can skip
      case "avatar":
        return true; // always valid — defaults to 1
      case "style":
        return onboardingStyle.length > 0;
      case "setupMode":
        return onboardingSetupMode !== "";
      case "runMode":
        return onboardingRunMode !== "";
      case "dockerSetup":
        return true; // informational step, always valid
      case "cloudProvider":
        if (onboardingCloudProvider === "elizacloud") return cloudConnected;
        return onboardingCloudProvider.length > 0;
      case "modelSelection":
        return (
          onboardingSmallModel.length > 0 && onboardingLargeModel.length > 0
        );
      case "cloudLogin":
        return cloudConnected;
      case "llmProvider":
        if (onboardingProvider === "anthropic-subscription") {
          return true;
        }
        if (onboardingProvider === "openai-subscription") {
          return true;
        }
        if (onboardingProvider === "elizacloud") {
          // Allow proceeding if logged in OR if API key is provided
          return onboardingElizaCloudTab === "login"
            ? cloudConnected
            : onboardingApiKey.trim().length > 0;
        }
        if (onboardingProvider === "ollama" || onboardingProvider === "pi-ai") {
          return true;
        }
        return onboardingProvider.length > 0 && onboardingApiKey.length > 0;
      case "inventorySetup":
        return true;
      case "connectors":
        return true; // fully optional — user can skip
      case "permissions":
        return true; // optional — user can skip and configure later
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";
  const showPrimaryNext = onboardingStep !== "permissions";

  /** On the llmProvider config screen, "back" returns to the provider grid. */
  const handleBack = () => {
    if (onboardingStep === "llmProvider" && onboardingProvider) {
      setState("onboardingProvider", "");
      setState("onboardingApiKey", "");
      setState("onboardingPrimaryModel", "");
    } else {
      handleOnboardingBack();
    }
  };

  return (
    <div className="mx-auto px-4 pb-16 text-center font-body h-full overflow-y-auto">
      {/* Progress bar */}
      <div className="w-full h-1 bg-border rounded-full overflow-hidden mb-1">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {/* Step counter */}
      <div className="text-[11px] text-muted text-center mb-1 tracking-wide">
        {t("onboarding.stepLabel", {
          current: stepIndex,
          total: totalSteps != null ? totalSteps : "?",
        })}
      </div>

      {renderStep(onboardingStep)}
      <div className="flex gap-2 mt-8 justify-center">
        {canGoBack && (
          <button
            type="button"
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer rounded-full hover:bg-accent-subtle hover:text-accent"
            onClick={handleBack}
            disabled={onboardingRestarting}
          >
            {t("common.back")}
          </button>
        )}
        {showPrimaryNext && (
          <button
            type="button"
            className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleOnboardingNext()}
            disabled={!canGoNext() || onboardingRestarting}
          >
            {onboardingRestarting
              ? t("onboarding.restarting")
              : t("common.next")}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Setup Step — checks Docker availability and guides installation
// ═══════════════════════════════════════════════════════════════════════════
