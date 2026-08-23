import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Alice durable mutation evidence outbox wiring", () => {
  test("commits mutation plus evidence before queue handoff and retries from an alarm", () => {
    const source = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const flush = source.slice(
      source.indexOf("private async flushEvidenceOutbox"),
      source.indexOf("export class AliceSession"),
    );
    expect(source).toContain("async alarm(): Promise<void>");
    expect(flush).toContain("ALICE_EVIDENCE_QUEUE.send");
    expect(flush).toContain("candidate.ackEvidence(record.eventId)");
    expect(flush).toContain("this.ctx.storage.setAlarm");
    expect(flush.indexOf("ALICE_EVIDENCE_QUEUE.send")).toBeLessThan(
      flush.indexOf("candidate.ackEvidence(record.eventId)"),
    );
    expect(flush.indexOf("candidate.ackEvidence(record.eventId)")).toBeLessThan(
      flush.indexOf('this.ctx.storage.put("state"'),
    );
  });

  test("does not auto-promote a stored authority on object startup", () => {
    const source = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const constructor = source.slice(
      source.indexOf("constructor(ctx: DurableObjectState"),
      source.indexOf("async alarm(): Promise<void>"),
    );
    expect(constructor).not.toContain("activateRelease");
    expect(constructor).toContain("release:unadmitted");
  });

  test("keeps emergency state and pause handling independent of release and subordinate credentials", () => {
    const durable = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const ingress = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const constructor = durable.slice(
      durable.indexOf("constructor(ctx: DurableObjectState"),
      durable.indexOf("async alarm(): Promise<void>"),
    );
    expect(constructor).toContain("loadAuthoritySafetyConfig(env)");
    expect(constructor).not.toContain("loadRuntimeConfig(env)");
    expect(constructor).not.toContain("ALICE_ACCESS_GATEWAY_SERVICE_TOKEN");
    expect(constructor).not.toContain("ALICE_AI_GATEWAY_SERVICE_TOKEN");

    const ownerAuthentication = ingress.slice(
      ingress.indexOf("const owner = await requireOwner"),
      ingress.indexOf("return await handleOwnerApi"),
    );
    expect(ownerAuthentication).toContain("loadOwnerAccessConfig(env)");
    expect(ownerAuthentication).not.toContain("loadRuntimeConfig(env)");

    const emergencyRoutes = ingress.slice(
      ingress.indexOf('path === "/control/api/v1/state"'),
      ingress.indexOf('path === "/control/api/v1/capabilities/grant"'),
    );
    expect(emergencyRoutes).toContain("const pauseMatch = path.match");
    expect(ingress).toContain("/control/internal/v1/emergency/pause-all");
    expect(ingress).toContain("authorizeEmergencyRecovery");
    expect(emergencyRoutes).not.toContain("runtimeConfig(env)");
  });

  test("gives the deployment controller only signed status and PAUSE_ALL ingress", () => {
    const ingress = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const machine = ingress.slice(
      ingress.indexOf("async function handleDeploymentController"),
      ingress.indexOf("async function handleInternal"),
    );
    expect(machine).toContain("alice-release.rndrntwrk.com");
    expect(machine).toContain("verifyAccessServiceJwt");
    expect(machine).toContain("authorizeDeploymentPause");
    expect(machine).not.toContain("authorizeEmergencyRecovery");
    expect(machine).not.toContain("ALICE_CONTROL_RECOVERY_TOKEN");
    expect(machine).toContain('path === "/control/internal/v1/deployment/status"');
    expect(machine).toContain('path === "/control/internal/v1/deployment/pause-all"');
    expect(machine).toContain('callDurable(authority, "/snapshot")');
    expect(machine).toContain("candidateAdmission");
    expect(machine).toContain('callDurable(authority, "/pause"');
    expect(machine).not.toContain('"/release/activate"');
    expect(machine).not.toContain('"/resume"');
    expect(machine).not.toContain("loadRuntimeConfig(env)");
  });

  test("persists and evidences budget-limit reconciliation before serving after eviction", () => {
    const durable = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const constructor = durable.slice(
      durable.indexOf("constructor(ctx: DurableObjectState"),
      durable.indexOf("async alarm(): Promise<void>"),
    );
    expect(constructor).toContain("reconcileBudgetLimit");
    expect(constructor).toContain('kind: "control.budget-invariant"');
    expect(constructor).toContain("stageEvidence");
    expect(constructor).toContain('ctx.storage.put("state"');
    expect(constructor.indexOf("stageEvidence")).toBeLessThan(
      constructor.indexOf(
        'ctx.storage.put("state"',
        constructor.indexOf("stageEvidence"),
      ),
    );
  });

  test("keeps release activation owner-explicit and ordinary admission read-only", () => {
    const durable = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const ingress = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const admitted = durable.slice(
      durable.indexOf("private async commitAdmitted"),
      durable.indexOf("private async flushEvidenceOutbox"),
    );
    expect(admitted).not.toContain("activateRelease");
    expect(admitted).toContain("releaseIsActive");
    const internalAdmission = ingress.slice(
      ingress.indexOf('path === "/control/internal/v1/runtime/admit"'),
      ingress.indexOf('path === "/control/internal/v1/model/reserve"'),
    );
    expect(internalAdmission).toContain('"/release/check"');
    expect(internalAdmission).not.toContain('"/release/activate"');
    const ownerAdmission = ingress.slice(
      ingress.indexOf('path === "/control/api/v1/release/admit"'),
      ingress.indexOf('path === "/control/api/v1/intents/authorize"'),
    );
    expect(ownerAdmission).toContain('"/release/activate"');
  });

  test("verifies resume receipts inside the authority object and commits the verified state tuple", () => {
    const durable = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const ingress = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const resume = durable.slice(
      durable.indexOf('if (url.pathname === "/resume")'),
      durable.indexOf('if (url.pathname === "/capability/revoke")'),
    );
    expect(resume).toContain("verifyRecoveryReceipt");
    expect(resume).toContain("currentReleaseEpoch: before.activeReleaseEpoch");
    expect(resume).toContain("currentRollbackBoundary: before.rollbackBoundary");
    expect(resume).toContain("recoveryAuthorization");
    expect(ingress).not.toContain("verifyRecoveryReceipt");
    expect(ingress).not.toContain("recoveryReceiptHash: verifiedReceipt.receiptHash");
  });

  test("gates owner session and plan mutations on the exact active release", () => {
    const durable = readFileSync(new URL("../src/durable.ts", import.meta.url), "utf8");
    const ingress = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const mutableStart = ingress.lastIndexOf("const config = await runtimeConfig(env);");
    const mutableOwner = ingress.slice(
      mutableStart,
      ingress.indexOf(
        "return jsonResponse({ ok: false, code: \"NOT_FOUND\" }, 404);",
        mutableStart,
      ),
    );
    expect(mutableOwner).toContain('callDurable(authority, "/plan/create"');
    expect(mutableOwner).toContain('callDurable(authority, "/session/mutate"');
    expect(mutableOwner).not.toContain("ALICE_PLANS.create");
    expect(mutableOwner).not.toContain("ALICE_SESSIONS.getByName");
    expect(durable).toContain('url.pathname === "/plan/create"');
    expect(durable).toContain('url.pathname === "/session/mutate"');
    expect(durable).toContain("deploymentManifestSha256");
    expect(durable).toContain("admissionGeneration");
    const sessionRead = ingress.slice(
      ingress.indexOf("if (sessionMatch && !sessionMatch[2]"),
      ingress.indexOf('path === "/control/api/v1/evidence"'),
    );
    expect(sessionRead).toContain('"/session/snapshot"');
    const controlIndex = ingress.slice(
      ingress.indexOf('if (path === "/control")'),
      ingress.indexOf("return await handleOwnerApi"),
    );
    expect(controlIndex).toContain('callDurable(authority, "/release/check")');
  });
});
