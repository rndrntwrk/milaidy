import { describe, expect, test } from "bun:test";

import { authorizeIntent } from "../src/policy";

const binding = {
  programDigest: "sha256:program",
  releaseDigest: "sha256:release",
  policyHash: "sha256:policy",
};
const argumentHash = `sha256:${"a".repeat(64)}`;
const alternateArgumentHash = `sha256:${"b".repeat(64)}`;

describe("Alice production policy", () => {
  test("denies high-risk actions even when release bindings are exact", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-trade-1",
        action: "trade.execute",
        target: "base:mainnet",
        argumentHash,
        nonce: "nonce-trade-1",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "ACTION_DISABLED",
      risk: "high",
    });
  });

  test("rejects an intent whose release binding does not match the active release", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-1",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-1",
        expiresAt: now + 60_000,
        ...binding,
        releaseDigest: "sha256:other-release",
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "RELEASE_BINDING_MISMATCH",
      risk: "low",
    });
  });

  test("allows a bound unpaused research intent before expiry", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-2",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-2",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: true,
      code: "AUTONOMOUS_LOW_RISK",
      risk: "low",
    });
  });

  test("PAUSE_ALL denies otherwise autonomous research", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-paused",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-paused",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: ["all"],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "PAUSED_ALL",
      risk: "low",
    });
  });

  test("PAUSE_RELEASE denies every signed release intent", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-release-paused",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-release-paused",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: ["release"],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "PAUSED_RELEASE",
      risk: "low",
    });
  });

  test("rejects an expired intent before evaluating action authority", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-expired",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-expired",
        expiresAt: now - 1,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "INTENT_EXPIRED",
      risk: "low",
    });
  });

  test("rejects structurally invalid intent identifiers and hashes", () => {
    const now = 1_787_400_000_000;
    const valid = {
      intentId: "intent-structural",
      action: "research.read",
      target: "source:deployment-handoff",
      argumentHash: `sha256:${"a".repeat(64)}`,
      nonce: "nonce-structural",
      expiresAt: now + 60_000,
      ...binding,
    };
    for (const candidate of [
      { ...valid, intentId: "" },
      { ...valid, action: "" },
      { ...valid, target: "" },
      { ...valid, argumentHash: "not-a-digest" },
      { ...valid, nonce: "" },
    ]) {
      expect(
        authorizeIntent(candidate, {
          now,
          binding,
          pausedScopes: [],
          consumedNonces: [],
          capability: null,
        }),
      ).toEqual({ allowed: false, code: "INTENT_INVALID", risk: "unknown" });
    }
  });

  test("rejects a consumed intent nonce", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-read-replay",
        action: "research.read",
        target: "source:deployment-handoff",
        argumentHash,
        nonce: "nonce-read-replay",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: ["nonce-read-replay"],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "NONCE_REPLAY",
      risk: "low",
    });
  });

  test("requires a capability grant for sandbox execution", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-sandbox-no-grant",
        action: "sandbox.execute",
        target: "sandbox:alice-release-tests",
        argumentHash,
        nonce: "nonce-sandbox-no-grant",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: null,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      code: "CAPABILITY_REQUIRED",
      risk: "low",
    });
  });

  test("accepts one exact live capability for sandbox execution", () => {
    const now = 1_787_400_000_000;
    const decision = authorizeIntent(
      {
        intentId: "intent-sandbox-granted",
        action: "sandbox.execute",
        capabilityId: "cap-sandbox-1",
        target: "sandbox:alice-release-tests",
        argumentHash,
        nonce: "nonce-intent-sandbox-1",
        expiresAt: now + 60_000,
        ...binding,
      },
      {
        now,
        binding,
        pausedScopes: [],
        consumedNonces: [],
        capability: {
          capabilityId: "cap-sandbox-1",
          scope: "sandbox.execute",
          target: "sandbox:alice-release-tests",
          argumentHash,
          nonce: "nonce-cap-sandbox-1",
          expiresAt: now + 120_000,
          rollbackBoundary: "sandbox:alice-release-tests",
          revokedAt: null,
          usedAt: null,
          ...binding,
        },
      },
    );

    expect(decision).toEqual({
      allowed: true,
      code: "CAPABILITY_AUTHORIZED",
      risk: "low",
    });
  });

  test("rejects capability grants that are mismatched, expired, revoked, or consumed", () => {
    const now = 1_787_400_000_000;
    const intent = {
      intentId: "intent-sandbox-invalid-grant",
      action: "sandbox.execute",
      capabilityId: "cap-sandbox-2",
      target: "sandbox:alice-release-tests",
      argumentHash,
      nonce: "nonce-intent-sandbox-2",
      expiresAt: now + 60_000,
      ...binding,
    };
    const grant = {
      capabilityId: "cap-sandbox-2",
      scope: "sandbox.execute",
      target: intent.target,
      argumentHash: intent.argumentHash,
      nonce: "nonce-cap-sandbox-2",
      expiresAt: now + 120_000,
      rollbackBoundary: "sandbox:alice-release-tests",
      revokedAt: null,
      usedAt: null,
      ...binding,
    };

    const scenarios = [
      [{ ...grant, capabilityId: "cap-other" }, "CAPABILITY_MISMATCH"],
      [{ ...grant, scope: "coding.patch.sandbox" }, "CAPABILITY_MISMATCH"],
      [{ ...grant, target: "sandbox:other" }, "CAPABILITY_MISMATCH"],
      [{ ...grant, argumentHash: alternateArgumentHash }, "CAPABILITY_MISMATCH"],
      [{ ...grant, releaseDigest: "sha256:other" }, "CAPABILITY_MISMATCH"],
      [{ ...grant, expiresAt: now }, "CAPABILITY_EXPIRED"],
      [{ ...grant, revokedAt: now - 1 }, "CAPABILITY_REVOKED"],
      [{ ...grant, usedAt: now - 1 }, "CAPABILITY_CONSUMED"],
      [{ ...grant, rollbackBoundary: "" }, "CAPABILITY_MISMATCH"],
    ] as const;

    for (const [capability, code] of scenarios) {
      expect(
        authorizeIntent(intent, {
          now,
          binding,
          pausedScopes: [],
          consumedNonces: [],
          capability,
        }),
      ).toEqual({ allowed: false, code, risk: "low" });
    }
  });

  test("a scoped coding pause blocks a valid sandbox capability", () => {
    const now = 1_787_400_000_000;
    const intent = {
      intentId: "intent-sandbox-paused",
      action: "sandbox.execute",
      capabilityId: "cap-sandbox-paused",
      target: "sandbox:alice-release-tests",
      argumentHash,
      nonce: "nonce-intent-sandbox-paused",
      expiresAt: now + 60_000,
      ...binding,
    };
    const decision = authorizeIntent(intent, {
      now,
      binding,
      pausedScopes: ["coding"],
      consumedNonces: [],
      capability: {
        capabilityId: "cap-sandbox-paused",
        scope: "sandbox.execute",
        target: intent.target,
        argumentHash: intent.argumentHash,
        nonce: "nonce-cap-sandbox-paused",
        expiresAt: now + 120_000,
        rollbackBoundary: "sandbox:alice-release-tests",
        revokedAt: null,
        usedAt: null,
        ...binding,
      },
    });

    expect(decision).toEqual({
      allowed: false,
      code: "PAUSED_CODING",
      risk: "low",
    });
  });
});
