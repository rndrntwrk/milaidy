import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAliceCandidateWorkflowVersion,
  runAliceWorkflowBindingCanary,
} from "./alice_workflow_binding_canary.mjs";

const workflowId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const previous = [{
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  className: "AlicePlanWorkflow",
  createdOn: "2026-08-22T12:00:00.000Z",
  modifiedOn: "2026-08-22T12:00:01.000Z",
  workflowId,
  hasDag: true,
  language: "javascript",
  defaultRetention: null,
  limits: { steps: 16 },
}];
const candidate = {
  ...previous[0],
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  createdOn: "2026-08-22T12:00:02.000Z",
  modifiedOn: "2026-08-22T12:00:02.000Z",
};
const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};

test("resolves exactly one candidate Workflow version beyond the rollback anchor", () => {
  assert.deepEqual(
    resolveAliceCandidateWorkflowVersion({
      previous,
      current: [...previous, candidate],
      expectedWorkflowId: workflowId,
    }),
    candidate,
  );
  assert.throws(
    () => resolveAliceCandidateWorkflowVersion({
      previous,
      current: previous,
      expectedWorkflowId: workflowId,
    }),
    /ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID/,
  );
  assert.throws(
    () => resolveAliceCandidateWorkflowVersion({
      previous,
      current: [
        ...previous,
        candidate,
        { ...candidate, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
      expectedWorkflowId: workflowId,
    }),
    /ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID/,
  );
});

test("proves a bounded runtime.health plan used the exact binding Workflow version", async () => {
  const calls = [];
  let providerReads = 0;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ parsed, init });
    if (parsed.origin === "https://alice.rndrntwrk.com" &&
        parsed.pathname === "/control/api/v1/plans" && init.method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.planId, "alice-canary-12345678123442348123456789012345");
      assert.equal(body.sessionId, "alice-canary-session-12345678123442348123456789012345");
      assert.equal(body.actions.length, 1);
      assert.equal(body.actions[0].action, "runtime.health");
      assert.deepEqual(
        {
          programDigest: body.actions[0].programDigest,
          releaseDigest: body.actions[0].releaseDigest,
          policyHash: body.actions[0].policyHash,
        },
        binding,
      );
      return Response.json({
        ok: true,
        planId: body.planId,
        status: "queued",
      }, { status: 202 });
    }
    if (parsed.origin === "https://api.cloudflare.com" &&
        parsed.pathname.endsWith(
          "/workflows/alice-production-plans/instances/alice-canary-12345678123442348123456789012345",
        )) {
      providerReads += 1;
      return Response.json({
        success: true,
        result: {
          id: "alice-canary-12345678123442348123456789012345",
          status: providerReads === 1 ? "running" : "complete",
          versionId: candidate.id,
          trigger: { source: "binding" },
          output: providerReads === 1
            ? null
            : JSON.stringify({
                schemaVersion: "alice.plan-result.v1",
                planId: "alice-canary-12345678123442348123456789012345",
                releaseDigest: binding.releaseDigest,
                decisions: [{
                  intentId: "runtime-health-12345678123442348123456789012345",
                  code: "AUTONOMOUS_LOW_RISK",
                  risk: "low",
                }],
                status: "queued-for-execution",
                completed: false,
              }),
        },
      });
    }
    if (parsed.origin === "https://alice.rndrntwrk.com" &&
        parsed.pathname.endsWith(
          "/control/api/v1/plans/alice-canary-12345678123442348123456789012345",
        )) {
      return Response.json({
        ok: true,
        planId: "alice-canary-12345678123442348123456789012345",
        status: "complete",
        output: {
          schemaVersion: "alice.plan-result.v1",
          planId: "alice-canary-12345678123442348123456789012345",
          releaseDigest: binding.releaseDigest,
          decisions: [{
            intentId: "runtime-health-12345678123442348123456789012345",
            code: "AUTONOMOUS_LOW_RISK",
            risk: "low",
          }],
          status: "queued-for-execution",
          completed: false,
        },
      });
    }
    throw new Error(`unexpected ${parsed.href}`);
  };
  const evidence = await runAliceWorkflowBindingCanary({
    fetchImpl,
    sleepImpl: async () => undefined,
    now: () => 1_787_400_000_000,
    randomUuid: () => "12345678-1234-4234-8123-456789012345",
    ownerAuthorization: "owner-access-authorization-at-least-32-bytes",
    apiToken: "cloudflare-provider-token-at-least-32-bytes",
    binding,
    deploymentManifestSha256: `sha256:${"4".repeat(64)}`,
    expectedWorkflowId: workflowId,
    expectedWorkflowVersionId: candidate.id,
  });
  assert.equal(evidence.schemaVersion, "alice.workflow-binding-canary.v1");
  assert.equal(evidence.workflowVersionId, candidate.id);
  assert.equal(evidence.triggerSource, "binding");
  assert.equal(evidence.status, "complete");
  assert.equal(evidence.action, "runtime.health");
  assert.equal(evidence.externalActionExecuted, false);
  assert.equal(providerReads, 2);
  assert.equal(
    calls.every((call) => !JSON.stringify(call).includes("cloudflare-provider-token")),
    false,
  );
  assert.equal("ownerAuthorization" in evidence, false);
  assert.equal("apiToken" in evidence, false);
});

for (const failure of ["wrong-instance", "api-trigger", "extra-output-field"]) {
  test(`fails closed on a ${failure} Workflow canary response`, async () => {
    const uuid = "12345678-1234-4234-8123-456789012345";
    const planId = `alice-canary-${uuid.replaceAll("-", "")}`;
    const intentId = `runtime-health-${uuid.replaceAll("-", "")}`;
    const output = {
      schemaVersion: "alice.plan-result.v1",
      planId,
      releaseDigest: binding.releaseDigest,
      decisions: [{ intentId, code: "AUTONOMOUS_LOW_RISK", risk: "low" }],
      status: "queued-for-execution",
      completed: false,
      ...(failure === "extra-output-field" ? { secret: "must-not-persist" } : {}),
    };
    const fetchImpl = async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.origin === "https://alice.rndrntwrk.com" && init.method === "POST") {
        return Response.json({ ok: true, planId, status: "queued" }, { status: 202 });
      }
      if (parsed.origin === "https://alice.rndrntwrk.com" && init.method === "GET") {
        return Response.json({ ok: true, planId, status: "complete", output });
      }
      return Response.json({
        success: true,
        result: {
          id: failure === "wrong-instance" ? "different-instance" : planId,
          status: "complete",
          versionId: candidate.id,
          trigger: { source: failure === "api-trigger" ? "api" : "binding" },
          output: JSON.stringify(output),
        },
      });
    };
    await assert.rejects(
      () => runAliceWorkflowBindingCanary({
        fetchImpl,
        sleepImpl: async () => undefined,
        now: () => 1_787_400_000_000,
        randomUuid: () => uuid,
        ownerAuthorization: "owner-access-authorization-at-least-32-bytes",
        apiToken: "cloudflare-provider-token-at-least-32-bytes",
        binding,
        deploymentManifestSha256: `sha256:${"4".repeat(64)}`,
        expectedWorkflowId: workflowId,
        expectedWorkflowVersionId: candidate.id,
      }),
      /ALICE_WORKFLOW_BINDING_CANARY_INVALID/,
    );
  });
}
