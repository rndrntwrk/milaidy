import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { ALICE_PAUSE_SCOPES } from "../src/authority";
import {
  ALICE_ALLOWED_MODELS,
  ALICE_AUTONOMOUS_ACTIONS,
  ALICE_CAPABILITY_ACTIONS,
  ALICE_DISABLED_ACTIONS,
} from "../src/policy";
import { ALICE_PRODUCTION_TRUST_PINS } from "../src/runtime-config";

describe("Alice source-owned production policy contract", () => {
  test("pins the exact raw policy artifact and all code-enforced sets", () => {
    const policyPath = new URL("../manifests/policy.v1.json", import.meta.url);
    const bytes = readFileSync(policyPath);
    const policy = JSON.parse(bytes.toString("utf8"));

    expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
      ALICE_PRODUCTION_TRUST_PINS.policyHash,
    );
    expect(policy.autonomousActions).toEqual([...ALICE_AUTONOMOUS_ACTIONS]);
    expect(policy.capabilityActions).toEqual([...ALICE_CAPABILITY_ACTIONS]);
    expect(policy.disabledActions).toEqual([...ALICE_DISABLED_ACTIONS]);
    expect(policy.pauseScopes).toEqual([...ALICE_PAUSE_SCOPES]);
    expect(policy.modelRouting.models).toEqual([...ALICE_ALLOWED_MODELS]);
    expect(policy.modelRouting.dailySynchronousUnitCeiling).toBe(100_000);
    expect(policy.nativeOwnerConversations.platform).toBe("telegram");
    expect(policy.nativeOwnerConversations.ownerBindingSha256).toBe(
      "sha256:f8b1566829c84cf5f91109d41177fa87ef28e1ab5b5fa0bf2a5642267fca05d5",
    );
    expect(policy.nativeOwnerConversations.operations).toEqual([
      "reply to incoming owner messages",
      "verify owner self-pairing",
    ]);
    expect(policy.nativeOwnerConversations.autonomousSocialOperations).toBe("disabled");
    expect(policy.nativeOwnerConversations.connectorPlane).toBe("inert");
    expect(policy.disabledActions).toContain("social.message");
    expect(policy.disabledActions).toContain("social.post");
    expect(policy.disabledActions).toContain("identity.admin");

  });
});
