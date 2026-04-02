/** Unit tests for onboarding `flow.ts` — unified 6-step flow. */
import { describe, expect, it } from "vitest";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  getOnboardingNavMetas,
  getStepOrder,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
  shouldSkipConnectionStepsForCloudProvisionedContainer,
  shouldUseCloudOnboardingFastTrack,
} from "../flow";

describe("onboarding flow", () => {
  describe("getStepOrder", () => {
    it("returns unified 6-step order", () => {
      expect(getStepOrder()).toEqual([
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
  });

  describe("resolveOnboardingNextStep", () => {
    it("advances through all steps", () => {
      expect(resolveOnboardingNextStep("identity")).toBe("hosting");
      expect(resolveOnboardingNextStep("hosting")).toBe("providers");
      expect(resolveOnboardingNextStep("providers")).toBe("voice");
      expect(resolveOnboardingNextStep("voice")).toBe("permissions");
      expect(resolveOnboardingNextStep("permissions")).toBe("launch");
      expect(resolveOnboardingNextStep("launch")).toBe(null);
    });
  });

  describe("resolveOnboardingPreviousStep", () => {
    it("steps back through all steps", () => {
      expect(resolveOnboardingPreviousStep("identity")).toBe(null);
      expect(resolveOnboardingPreviousStep("hosting")).toBe("identity");
      expect(resolveOnboardingPreviousStep("providers")).toBe("hosting");
      expect(resolveOnboardingPreviousStep("voice")).toBe("providers");
      expect(resolveOnboardingPreviousStep("permissions")).toBe("voice");
      expect(resolveOnboardingPreviousStep("launch")).toBe("permissions");
    });
  });

  describe("canRevertOnboardingTo", () => {
    it("allows backward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "hosting" }),
      ).toBe(true);
      expect(
        canRevertOnboardingTo({ current: "launch", target: "identity" }),
      ).toBe(true);
    });
    it("disallows same-step jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "providers" }),
      ).toBe(false);
    });
    it("disallows forward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "identity", target: "hosting" }),
      ).toBe(false);
    });
  });

  describe("getOnboardingNavMetas", () => {
    it("returns all 6 steps regardless of current step", () => {
      const metas = getOnboardingNavMetas("providers", false);
      expect(metas.map((m) => m.id)).toEqual([
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
    it("returns same steps when cloudOnly", () => {
      const metas = getOnboardingNavMetas("identity", true);
      expect(metas.map((m) => m.id)).toEqual([
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
  });

  describe("shouldSkipConnectionStepsForCloudProvisionedContainer", () => {
    it("finishes immediately after identity for cloud-provisioned containers", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "identity",
          cloudProvisionedContainer: true,
        }),
      ).toBe(true);
    });

    it("keeps the normal wizard flow for non-cloud or later steps", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "identity",
          cloudProvisionedContainer: false,
        }),
      ).toBe(false);
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "hosting",
          cloudProvisionedContainer: true,
        }),
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
      expect(getFlaminaTopicForOnboardingStep("permissions")).toBe(
        "permissions",
      );
      expect(getFlaminaTopicForOnboardingStep("hosting")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("identity")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("launch")).toBe(null);
    });
  });
});
