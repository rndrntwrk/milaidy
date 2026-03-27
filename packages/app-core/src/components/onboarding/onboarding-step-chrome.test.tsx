// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  OnboardingLinkActionButton,
  OnboardingSecondaryActionButton,
} from "./onboarding-step-chrome";

describe("onboarding step chrome actions", () => {
  it("uses onboarding-owned chrome for secondary actions instead of theme ghost styles", () => {
    render(<OnboardingSecondaryActionButton>Back</OnboardingSecondaryActionButton>);

    const button = screen.getByRole("button", { name: "Back" });
    expect(button.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(button.className).toContain(
      "focus-visible:ring-[var(--onboarding-secondary-focus-ring)]",
    );
    expect(button.className).toContain(
      "[text-shadow:var(--onboarding-text-shadow-muted)]",
    );
    expect(button.className).toContain(
      "[-webkit-text-stroke:0.25px_var(--onboarding-text-stroke-soft)]",
    );
    expect(button.className).not.toContain("bg-bg-accent");
    expect(button.className).not.toContain("text-muted-strong");
  });

  it("keeps onboarding link actions on onboarding-owned interaction tokens", () => {
    render(<OnboardingLinkActionButton>Report issue</OnboardingLinkActionButton>);

    const button = screen.getByRole("button", { name: "Report issue" });
    expect(button.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(button.className).toContain("hover:text-[var(--onboarding-link)]");
    expect(button.className).toContain(
      "[text-shadow:var(--onboarding-text-shadow-muted)]",
    );
    expect(button.className).not.toContain("bg-bg-accent");
  });
});
