/** Unit tests for onboarding `flow.ts` — 4-step flow. */
import { describe, expect, it } from "vitest";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  getOnboardingNavMetas,
  getStepOrder,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
  shouldSkipConnectionStepsForCloudProvisionedContainer,
  shouldSkipFeaturesStep,
  shouldUseCloudOnboardingFastTrack,
} from "../flow";

describe("onboarding flow", () => {
  describe("getStepOrder", () => {
    it("returns 4-step order (deployment absorbs splash, features at end)", () => {
      expect(getStepOrder()).toEqual([
        "deployment",
        "identity",
        "providers",
        "features",
      ]);
    });
  });

  describe("resolveOnboardingNextStep", () => {
    it("advances through all steps", () => {
      expect(resolveOnboardingNextStep("deployment")).toBe("identity");
      expect(resolveOnboardingNextStep("identity")).toBe("providers");
      expect(resolveOnboardingNextStep("providers")).toBe("features");
      expect(resolveOnboardingNextStep("features")).toBe(null);
    });
  });

  describe("resolveOnboardingPreviousStep", () => {
    it("steps back through all steps", () => {
      expect(resolveOnboardingPreviousStep("deployment")).toBe(null);
      expect(resolveOnboardingPreviousStep("identity")).toBe("deployment");
      expect(resolveOnboardingPreviousStep("providers")).toBe("identity");
      expect(resolveOnboardingPreviousStep("features")).toBe("providers");
    });
  });

  describe("canRevertOnboardingTo", () => {
    it("allows backward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "identity" }),
      ).toBe(true);
      expect(
        canRevertOnboardingTo({ current: "features", target: "deployment" }),
      ).toBe(true);
      expect(
        canRevertOnboardingTo({ current: "features", target: "providers" }),
      ).toBe(true);
    });
    it("disallows same-step jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "providers" }),
      ).toBe(false);
    });
    it("disallows forward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "identity", target: "providers" }),
      ).toBe(false);
      expect(
        canRevertOnboardingTo({ current: "deployment", target: "features" }),
      ).toBe(false);
    });
  });

  describe("getOnboardingNavMetas", () => {
    it("returns all 4 steps", () => {
      const metas = getOnboardingNavMetas("providers", false);
      expect(metas.map((m) => m.id)).toEqual([
        "deployment",
        "identity",
        "providers",
        "features",
      ]);
    });
    it("hides deployment step for cloud-only builds", () => {
      const metas = getOnboardingNavMetas("identity", true);
      expect(metas.map((m) => m.id)).toEqual([
        "identity",
        "providers",
        "features",
      ]);
    });
  });

  describe("shouldSkipConnectionStepsForCloudProvisionedContainer", () => {
    it("finishes immediately after deployment for cloud-provisioned containers", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "deployment",
          cloudProvisionedContainer: true,
        }),
      ).toBe(true);
    });

    it("keeps the normal wizard flow for non-cloud or later steps", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "deployment",
          cloudProvisionedContainer: false,
        }),
      ).toBe(false);
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "identity",
          cloudProvisionedContainer: true,
        }),
      ).toBe(false);
    });
  });

  describe("shouldSkipFeaturesStep", () => {
    it("keeps the features step for remote targets so local capabilities still land", () => {
      expect(shouldSkipFeaturesStep({ onboardingServerTarget: "remote" })).toBe(
        false,
      );
    });
    it("also keeps the features step for local and cloud targets", () => {
      expect(shouldSkipFeaturesStep({ onboardingServerTarget: "local" })).toBe(
        false,
      );
      expect(
        shouldSkipFeaturesStep({ onboardingServerTarget: "elizacloud" }),
      ).toBe(false);
    });
  });

  describe("shouldUseCloudOnboardingFastTrack", () => {
    it("always fast-tracks cloud-provisioned containers", () => {
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: true,
          elizaCloudConnected: false,
          onboardingRunMode: "",
          onboardingProvider: "",
        }),
      ).toBe(true);
    });

    it("preserves the existing Eliza Cloud fast-track for connected cloud setups", () => {
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: false,
          elizaCloudConnected: true,
          onboardingRunMode: "cloud",
          onboardingProvider: "elizacloud",
        }),
      ).toBe(true);
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: false,
          elizaCloudConnected: true,
          onboardingRunMode: "local",
          onboardingProvider: "anthropic",
        }),
      ).toBe(false);
    });
  });

  describe("getFlaminaTopicForOnboardingStep", () => {
    it("maps advanced guide topics", () => {
      expect(getFlaminaTopicForOnboardingStep("providers")).toBe("provider");
      expect(getFlaminaTopicForOnboardingStep("features")).toBe("features");
      expect(getFlaminaTopicForOnboardingStep("identity")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("deployment")).toBe(null);
    });
  });
});
