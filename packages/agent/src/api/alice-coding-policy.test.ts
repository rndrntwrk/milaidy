import { describe, expect, it } from "vitest";
import {
  resolveAliceCodingActionDecision,
  resolveAliceOperationalDefaults,
} from "./alice-coding-policy";

describe("Alice coding and deploy policy", () => {
  it("allows code/build/pr work and staging deploys by default", () => {
    const defaults = resolveAliceOperationalDefaults({});

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "run_tests",
        repo: "rndrntwrk/milaidy",
      }),
    ).toMatchObject({ allowed: true, requiresApproval: false });

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "deploy",
        environment: "staging",
        deployRail: "webhook",
        repo: "Render-Network-OS/555-bot",
      }),
    ).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it("denies deploy decisions without a valid environment", () => {
    const defaults = resolveAliceOperationalDefaults({});

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "deploy",
        deployRail: "webhook",
        repo: "Render-Network-OS/555-bot",
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      reason: "Deploy environment must be staging or production.",
    });
  });

  it("requires explicit human approval for production deploys", () => {
    const defaults = resolveAliceOperationalDefaults({});

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "deploy",
        environment: "production",
        deployRail: "webhook",
        repo: "Render-Network-OS/555-bot",
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: true,
      reason: "Production deploy requires explicit human approval.",
    });

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "deploy",
        environment: "production",
        deployRail: "webhook",
        repo: "Render-Network-OS/555-bot",
        approval: {
          approvedBy: "gl4sspr1sm@gmail.com",
          approvalId: "ops-approval-1",
        },
      }),
    ).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it("blocks ad-hoc deploy rails so Ops remains the deployment source of truth", () => {
    const defaults = resolveAliceOperationalDefaults({});

    expect(
      resolveAliceCodingActionDecision(defaults, {
        action: "deploy",
        environment: "production",
        deployRail: "local-shell",
        repo: "Render-Network-OS/555-bot",
        approval: {
          approvedBy: "gl4sspr1sm@gmail.com",
          approvalId: "ops-approval-1",
        },
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      reason: "Deploys must use the webhook rail so they are visible in Ops.",
    });
  });

  it("can narrow allowed repositories from config", () => {
    const config = resolveAliceOperationalDefaults({
      alice: {
        coding: {
          allowedRepos: ["Render-Network-OS/milaidy"],
        },
      },
    });

    expect(
      resolveAliceCodingActionDecision(config, {
        action: "open_pr",
        repo: "Render-Network-OS/stream",
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      reason: "Repository is not in Alice's allowed repo list.",
    });
  });
});
