import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as configModule from "../src/runtime-config";
import { aliceCodingArgumentHash } from "../src/coding-task";
import { ALICE_CODING_LIFETIME_MS } from "../src/policy";

mock.module("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: any) {} }, WorkflowEntrypoint: class {},
}));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { AliceCodingWorkflow } = await import("../src/coding-workflow");
afterEach(() => mock.restore());

test("coding survives a twenty-minute preparation/run without a Queue handoff or duplicate execution", async () => {
  const start = 1_791_000_000_000;
  let now = start;
  spyOn(Date, "now").mockImplementation(() => now);
  const binding = { programDigest: `sha256:${"1".repeat(64)}`,
    releaseDigest: `sha256:${"2".repeat(64)}`, policyHash: `sha256:${"3".repeat(64)}` };
  const admission = { binding, deploymentManifestSha256: `sha256:${"4".repeat(64)}`, admissionGeneration: 1 };
  spyOn(configModule, "loadRuntimeConfig").mockResolvedValue(admission as any);
  const capabilityId = "cap-00000000-0000-4000-8000-000000000001";
  const taskId = `task-${capabilityId}`, owner = `owner:sha256:${"a".repeat(64)}`;
  const coding = { repository: "rndrntwrk/milaidy", baseCommit: "b".repeat(40), prompt: "Fix the connector token placeholder.", delivery: "pull-request" as const };
  const intent = { intentId: `intent-${capabilityId}`, action: "coding.pr.create", target: coding.repository,
    argumentHash: await aliceCodingArgumentHash(coding), nonce: "nonce-coding-workflow", capabilityId,
    expiresAt: start + ALICE_CODING_LIFETIME_MS, ...binding };
  const workItem = { schemaVersion: "alice.work-item.v1", workId: `work-${capabilityId}`, planId: taskId,
    approvalId: `approval-${capabilityId}`, actor: owner, sessionId: taskId, enqueuedAt: start, admission, intent, coding };
  let work: any = null, executions = 0, publications = 0, evidenceAttempts = 0;
  let sandboxFailure = false;
  const queued = mock(() => { throw new Error("CODING_MUST_NOT_USE_QUEUE"); });
  const env: any = {
    ALICE_WORK_QUEUE: { send: queued },
    ALICE_STATE_PLANE_SERVICE_TOKEN: "state-token-longer-than-thirty-two-characters",
    ALICE_EVIDENCE_QUEUE_HMAC_KEY: "evidence-key-longer-than-thirty-two-characters",
    ALICE_AUTHORITY: { getByName: () => ({ async fetch(url: string) {
      const path = new URL(url).pathname;
      if (path === "/release/check") return Response.json({ allowed: true, ...admission,
        release: { deploymentManifestSha256: admission.deploymentManifestSha256 } });
      if (path === "/snapshot") return Response.json({ authority: { pausedScopes: [] } });
      if (path === "/authorize") return Response.json({ decision: { allowed: now < intent.expiresAt,
        code: now < intent.expiresAt ? "INTENT_ALREADY_AUTHORIZED" : "INTENT_EXPIRED" } });
      throw new Error(`UNEXPECTED_AUTHORITY_PATH:${path}`);
    } }) },
    ALICE_STATE_PLANE: { async fetch(request: Request) {
      const body: any = await request.json();
      if (body.operation === "record.get") return Response.json({ ok: true, record: work });
      if (body.operation !== "records.atomic") throw new Error("UNEXPECTED_STATE_OPERATION");
      for (const record of body.records) if (record.kind === "work") work = record;
      return Response.json({ ok: true });
    } },
    ALICE_CODING_SANDBOX: { async fetch() {
      executions++;
      now += 20 * 60_000;
      if (sandboxFailure) return Response.json({ code: "CODING_AGENT_FAILED" }, { status: 410 });
      return Response.json({ ok: true, result: { changes: [{ path: "src/token.ts" }], summary: "done" } });
    } },
    ALICE_CODING_PUBLISH_TOKEN: "coding-publish-token-longer-than-thirty-two-characters",
    ALICE_RUNTIME_HOST: { async fetch(request: Request) {
      const input: any = await request.json();
      expect(input.intent.expiresAt - input.requestedAt).toBe(ALICE_CODING_LIFETIME_MS);
      expect(input.requestedAt).toBe(start);
      expect(now - input.requestedAt).toBe(20 * 60_000);
      publications++;
      return Response.json({ ok: true, result: { pullRequestUrl: "https://github.com/rndrntwrk/milaidy/pull/123" } });
    } },
    ALICE_EVIDENCE_QUEUE: { async send() {
      evidenceAttempts++;
      if (evidenceAttempts === 1) throw new Error("transient evidence failure after persisted completion");
    } },
  };
  const workflow = Object.assign(Object.create(AliceCodingWorkflow.prototype), { env });
  const configurations: any[] = [];
  const step: any = { async do(name: string, config: any, callback?: () => Promise<unknown>) {
    if (!callback) return config();
    configurations.push({ name, ...config });
    for (let attempt = 0; ; attempt++) {
      try { return await callback(); }
      catch (error) {
        if ((error as Error).message !== "WORK_DEPENDENCY_UNAVAILABLE" || attempt >= config.retries.limit) throw error;
      }
    }
  } };
  const event: any = { payload: { taskId, actor: owner, sessionId: taskId, requestedAt: start, workItem } };
  expect(await workflow.run(event, step)).toMatchObject({ status: "completed" });
  expect(executions).toBe(1);
  expect(publications).toBe(1);
  expect(evidenceAttempts).toBe(2);
  expect(work.payload.state).toBe("completed");
  expect(queued).not.toHaveBeenCalled();
  expect(configurations).toEqual([{ name: "execute coding task", timeout: "31 minutes",
    retries: { limit: 2, delay: "10 seconds", backoff: "constant" } }]);

  // A terminal sandbox failure must never be presented as completed or executed again.
  now = start;
  work = null;
  sandboxFailure = true;
  await expect(workflow.run(event, step)).rejects.toThrow("CODING_TASK_FAILED");
  expect(executions).toBe(2);
  expect(work.payload.state).toBe("failed");
  expect(queued).not.toHaveBeenCalled();
});
