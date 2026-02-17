import { describe, expect, it } from "vitest";
import { createDefaultAutonomyIdentity } from "./schema.js";
import {
  evaluateIdentityUpdatePolicy,
  identityChangedFields,
} from "./update-policy.js";

describe("identity update policy", () => {
  it("computes normalized changed fields", () => {
    const current = createDefaultAutonomyIdentity();
    const changed = identityChangedFields(current, {
      communicationStyle: { tone: "formal" },
      softPreferences: { locale: "en-US" },
    } as any);

    expect(changed).toEqual([
      "communicationStyle.tone",
      "softPreferences.locale",
    ]);
  });

  it("allows low-risk api updates with actor attribution", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(
      current,
      { communicationStyle: { tone: "formal" } } as any,
      { source: "api", actor: "ops-user" },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.approvalRequired).toBe(false);
    expect(decision.risk).toBe("low");
  });

  it("requires approval metadata for high-risk api updates", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(
      current,
      { coreValues: ["helpfulness", "safety"] },
      { source: "api", actor: "ops-user" },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.approvalRequired).toBe(true);
    expect(decision.violations).toContain(
      "approvedBy is required when modifying name/coreValues/hardBoundaries",
    );
    expect(decision.violations).toContain(
      "reason is required when modifying name/coreValues/hardBoundaries",
    );
  });

  it("allows high-risk updates when approval metadata is complete", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(
      current,
      { hardBoundaries: ["never reveal credentials"] },
      {
        source: "api",
        actor: "ops-user",
        approvedBy: "security-reviewer",
        reason: "policy hardening",
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.approvalRequired).toBe(true);
    expect(decision.risk).toBe("high");
  });

  it("rejects updates that mutate kernel-managed fields directly", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(
      current,
      { identityVersion: 99 } as any,
      { source: "api", actor: "ops-user" },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContain(
      "identityVersion is kernel-managed and cannot be set directly",
    );
  });

  it("requires non-anonymous actor for api source", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(
      current,
      { communicationStyle: { tone: "formal" } } as any,
      { source: "api" },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.violations).toContain(
      "a named actor is required for API/CLI identity updates",
    );
  });

  it("allows system-sourced high-risk updates without external approval", () => {
    const current = createDefaultAutonomyIdentity();
    const decision = evaluateIdentityUpdatePolicy(current, {
      coreValues: ["helpfulness", "safety"],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe("system");
    expect(decision.approvalRequired).toBe(false);
  });
});
