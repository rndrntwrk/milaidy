import { describe, expect, it } from "vitest";
import { deriveSessionOnboardingComplete } from "./startup-phase-poll";

describe("deriveSessionOnboardingComplete", () => {
  it("treats cloud-provisioned containers as complete even with empty browser state", () => {
    expect(
      deriveSessionOnboardingComplete({
        complete: false,
        cloudProvisioned: true,
        onboardingCompletionCommitted: false,
      }),
    ).toBe(true);
  });

  it("does not preserve optimistic local completion when the backend is incomplete", () => {
    expect(
      deriveSessionOnboardingComplete({
        complete: false,
        cloudProvisioned: false,
        onboardingCompletionCommitted: true,
      }),
    ).toBe(false);
  });

  it("keeps explicit backend completion authoritative", () => {
    expect(
      deriveSessionOnboardingComplete({
        complete: true,
        cloudProvisioned: false,
        onboardingCompletionCommitted: false,
      }),
    ).toBe(true);
  });
});
