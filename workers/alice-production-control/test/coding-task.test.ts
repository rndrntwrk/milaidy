import { expect, test } from "bun:test";
import { aliceCodingArgumentHash, prepareAliceCodingTask } from "../src/coding-task";
import type { CapabilityGrant } from "../src/policy";

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
const request = {
  repository: "Render-Network-OS/555-bot",
  baseCommit: "a".repeat(40),
  prompt: "Repair the Telegram command acknowledgment.",
};

test("coding request matches one exact WebAuthn grant and yields a stable task", async () => {
  const argumentHash = await aliceCodingArgumentHash(request);
  const grant: CapabilityGrant = {
    capabilityId: "cap-00000000-0000-4000-8000-000000000001",
    owner: `owner:${digest("1")}`,
    scope: "coding.patch.sandbox",
    target: request.repository,
    argumentHash,
    nonce: "nonce-00000000-0000-4000-8000-000000000001",
    expiresAt: Date.now() + 60_000,
    rollbackBoundary: "release:test",
    revokedAt: null,
    usedAt: null,
    programDigest: digest("2"),
    releaseDigest: digest("3"),
    policyHash: digest("4"),
  };
  const task = await prepareAliceCodingTask(request, grant);
  expect(task.taskId).toBe(`task-${grant.capabilityId}`);
  expect(task.intent.target).toBe(request.repository);
  expect(task.intent.argumentHash).toBe(argumentHash);
  expect(task.intent.capabilityId).toBe(grant.capabilityId);
  await expect(
    prepareAliceCodingTask({ ...request, prompt: "Different work" }, grant),
  ).rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(
    prepareAliceCodingTask({ ...request, repository: "rndrntwrk/milaidy" }, grant),
  ).rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(
    aliceCodingArgumentHash({ ...request, repository: "OtherOrg/private" }),
  ).rejects.toThrow("CODING_REQUEST_INVALID");
});

test("draft PR delivery requires its own exact task grant", async () => {
  const publishRequest = { ...request, delivery: "pull-request" as const };
  const grant: CapabilityGrant = {
    capabilityId: "cap-00000000-0000-4000-8000-000000000002",
    owner: `owner:${digest("1")}`,
    scope: "coding.pr.create",
    target: request.repository,
    argumentHash: await aliceCodingArgumentHash(publishRequest),
    nonce: "nonce-00000000-0000-4000-8000-000000000002",
    expiresAt: Date.now() + 60_000,
    rollbackBoundary: "release:test",
    revokedAt: null,
    usedAt: null,
    programDigest: digest("2"),
    releaseDigest: digest("3"),
    policyHash: digest("4"),
  };
  expect((await prepareAliceCodingTask(publishRequest, grant)).intent.action).toBe("coding.pr.create");
  await expect(prepareAliceCodingTask(request, grant)).rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(prepareAliceCodingTask(publishRequest, { ...grant, scope: "coding.patch.sandbox" }))
    .rejects.toThrow("CODING_GRANT_MISMATCH");
});

test("merge approval binds exact source task, PR and head to a separate grant", async () => {
  const { aliceCodingMergeArgumentHash, prepareAliceCodingMerge } = await import("../src/coding-task");
  const merge = { repository: request.repository,
    sourceTaskId: "task-cap-00000000-0000-4000-8000-000000000001",
    pullRequestNumber: 17, headCommit: "e".repeat(40) };
  const grant: CapabilityGrant = { capabilityId: "cap-00000000-0000-4000-8000-000000000003",
    owner: `owner:${digest("1")}`, scope: "repository.merge", target: merge.repository,
    argumentHash: await aliceCodingMergeArgumentHash(merge), nonce: "nonce-merge-000003",
    expiresAt: Date.now() + 600_000, rollbackBoundary: "release:test", revokedAt: null,
    usedAt: null, programDigest: digest("2"), releaseDigest: digest("3"), policyHash: digest("4") };
  expect((await prepareAliceCodingMerge(merge, grant)).intent.action).toBe("repository.merge");
  for (const changed of [{ ...merge, pullRequestNumber: 18 }, { ...merge, headCommit: "f".repeat(40) },
    { ...merge, sourceTaskId: "task-cap-00000000-0000-4000-8000-000000000009" }]) {
    await expect(prepareAliceCodingMerge(changed, grant)).rejects.toThrow("CODING_GRANT_MISMATCH");
  }
  await expect(prepareAliceCodingMerge(merge, { ...grant, scope: "coding.pr.create" }))
    .rejects.toThrow("CODING_GRANT_MISMATCH");
  await expect(aliceCodingMergeArgumentHash({ ...merge, mergeMethod: "merge" }))
    .rejects.toThrow("CODING_MERGE_REQUEST_INVALID");
});

test("owner task-ID reconciliation persists original proof after expiry and cannot lose it to blocked work", async () => {
  const { mock } = await import("bun:test");
  mock.module("cloudflare:workers", () => ({
    DurableObject: class { constructor(public ctx: any) {} }, WorkflowEntrypoint: class {},
  }));
  mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
  const { handleOwnerApi } = await import("../src/index");
  const { aliceCodingMergeArgumentHash } = await import("../src/coding-task");
  const actor = `owner:sha256:${"1".repeat(64)}`;
  const taskId = "task-cap-00000000-0000-4000-8000-000000000003";
  const sourceTaskId = "task-cap-00000000-0000-4000-8000-000000000001";
  const requestedAt = Date.now() - 900_000;
  const mergedAt = new Date(requestedAt + 20_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const merge = { repository: request.repository, sourceTaskId, pullRequestNumber: 17,
    headCommit: "e".repeat(40) };
  const binding = { programDigest: digest("2"), releaseDigest: digest("3"), policyHash: digest("4") };
  const admission = { binding, deploymentManifestSha256: digest("5"), admissionGeneration: 7 };
  const intent = { intentId: `intent-${taskId.slice(5)}`, action: "repository.merge",
    target: merge.repository, argumentHash: await aliceCodingMergeArgumentHash(merge),
    nonce: "nonce-merge-reconcile", expiresAt: requestedAt + 600_000,
    capabilityId: taskId.slice(5), ...binding };
  const work = { workId: `work-${taskId.slice(5)}`, planId: taskId,
    action: "repository.merge", state: "pending", request: merge,
    argumentHash: intent.argumentHash, intent, admission, requestedAt };
  const records = new Map<string, any>([
    [`work:${work.workId}`, { payload: work, updatedAt: requestedAt }],
    [`work:work-${sourceTaskId.slice(5)}`, { payload: { action: "coding.pr.create", state: "completed",
      result: { branch: `alice/${sourceTaskId}`, commitSha: merge.headCommit,
        baseCommit: request.baseCommit, pullRequestUrl: `https://github.com/${merge.repository}/pull/17` } },
      updatedAt: requestedAt - 1 }],
  ]);
  const { canonicalJson } = await import("../src/program");
  let authorityCalls = 0;
  let hostCalls = 0;
  let queueOnline = false;
  let retryAt = 0;
  const delivered: any[] = [];
  const { AuthorityLedger } = await import("../src/authority");
  const currentBinding = { programDigest: digest("6"), releaseDigest: digest("7"), policyHash: digest("8") };
  const ledger = AuthorityLedger.create(currentBinding, 10_000, "release:current");
  ledger.pause("all", Date.now(), actor, "pause-outbox-test");
  let durableState = ledger.exportState();
  let authority: import("../src/durable").AliceAuthority;
  const env = {
    ALICE_MODEL_DAILY_BUDGET_UNITS: "10000",
    ALICE_CONTROL_RECOVERY_TOKEN: "test-control-recovery-token-with-more-than-32-bytes",
    ALICE_EVIDENCE_QUEUE_HMAC_KEY: "test-evidence-queue-hmac-key-with-more-than-32-bytes",
    ALICE_STATE_PLANE_SERVICE_TOKEN: "test-state-service-token-with-more-than-32-bytes",
    ALICE_CODING_PUBLISH_TOKEN: "test-publish-token-with-more-than-32-bytes",
    ALICE_STATE_PLANE: { async fetch(req: Request) {
      const body = await req.json() as any;
      if (body.operation === "record.get") {
        expect(body.ownerId).toBe(actor);
        return Response.json({ ok: true,
          record: JSON.parse(canonicalJson(records.get(`${body.kind}:${body.recordId}`) ?? null)) });
      }
      expect(body.operation).toBe("records.atomic");
      for (const record of body.records) {
        expect(record.ownerId).toBe(actor);
        records.set(`${record.kind}:${record.recordId}`, JSON.parse(canonicalJson(record)));
      }
      return Response.json({ ok: true });
    } },
    ALICE_AUTHORITY: { getByName() { return { async fetch(req: Request | string, init?: RequestInit) {
      const incoming = typeof req === "string" ? new Request(req, init) : req;
      if (new URL(incoming.url).pathname === "/coding/merge/evidence") return authority.fetch(incoming);
      authorityCalls += 1;
      throw new Error("release paused and changed");
    } }; } },
    ALICE_RUNTIME_HOST: { async fetch(req: Request) {
      hostCalls += 1;
      const body = await req.json() as any;
      expect(body.reconcileOnly).toBe(true);
      expect(body.admission).toEqual(admission);
      expect(body.intent).toEqual(intent);
      return Response.json({ ok: true, reconciled: true, result: { ...merge,
        pullRequestUrl: `https://github.com/${merge.repository}/pull/17`,
        mergeCommit: "f".repeat(40), mergedAt,
        mergedBy: "alice-rndrntwrk-coding[bot]", mergeMethod: "squash" } });
    } },
    ALICE_EVIDENCE_QUEUE: { async send(value: any) {
      if (!queueOnline) throw new Error("queue temporarily unavailable");
      delivered.push(value.record);
    } },
    ALICE_CODING_WORKFLOW: { async get() { throw new Error("not a workflow"); } },
  };
  const { AliceAuthority } = await import("../src/durable");
  authority = new AliceAuthority({ id: { name: "authority/global-safety-v1" },
    blockConcurrencyWhile: (callback: () => Promise<void>) => callback(),
    storage: { async get() { return structuredClone(durableState); },
      async put(_key: string, value: typeof durableState) { durableState = structuredClone(value); },
      async setAlarm(at: number) { retryAt = at; } },
  } as any, env as any);
  const path = "/control/api/v1/coding/merge";
  const response = await handleOwnerApi(new Request(`https://alice.rndrntwrk.com${path}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId, reconcileOnly: true }),
  }), env as any, actor, path);
  expect(await response.json()).toMatchObject({ ok: true, status: "completed", evidencePending: true });
  expect(authorityCalls).toBe(0);
  expect(hostCalls).toBe(1);
  const proof = records.get(`approvalReceipt:merge-receipt-${intent.capabilityId}`).payload;
  expect(proof.result.mergedAt).toBe(mergedAt);
  expect(proof.evidence.occurredAt).toBe(new Date(mergedAt).toISOString());
  const { validateEvidenceRecord } = await import("../src/evidence");
  expect(validateEvidenceRecord(proof.evidence)).toEqual({ ok: true });
  expect(Object.values(durableState.evidenceOutbox)).toEqual([proof.evidence]);
  expect(retryAt).toBeGreaterThan(0);
  const reordered = await authority.fetch(new Request("https://alice.internal/coding/merge/evidence", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor, taskId, record: { ...proof.evidence,
      details: { ...proof.evidence.details, admission: { binding,
        deploymentManifestSha256: admission.deploymentManifestSha256, admissionGeneration: 7 } } } }),
  }));
  expect(reordered.status).toBe(200);
  expect((await reordered.json()).code).toBe("EVIDENCE_ALREADY_STAGED");
  const forged = await authority.fetch(new Request("https://alice.internal/coding/merge/evidence", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor, taskId, record: { ...proof.evidence,
      details: { ...proof.evidence.details, headCommit: "a".repeat(40) } } }),
  }));
  expect(forged.status).toBe(409);
  queueOnline = true;
  await authority.alarm();
  expect(delivered).toEqual([proof.evidence]);
  expect(durableState.evidenceOutbox).toEqual({});
  records.set(`work:${work.workId}`, { payload: { ...work, state: "blocked", code: "CODING_MERGE_BLOCKED" } });
  const taskPath = `/control/api/v1/coding/tasks/${taskId}`;
  const readback = await handleOwnerApi(new Request(`https://alice.rndrntwrk.com${taskPath}`),
    env as any, actor, taskPath);
  expect(await readback.json()).toMatchObject({ ok: true, work: {
    state: "completed", code: "MERGE_VERIFIED", admission,
    result: { mergeCommit: "f".repeat(40) }, evidence: { binding } } });
});

test("coding page serves valid JavaScript with exact merge and read-only reconciliation controls", async () => {
  const { codingPageResponse } = await import("../src/coding-page");
  const script = await codingPageResponse("/control/coding.js")!.text();
  expect(() => new Function(script)).not.toThrow();
  expect(script).toContain("operation: 'repository.merge'");
  expect(script).toContain("{ taskId, reconcileOnly: true }");
  const page = codingPageResponse("/control/coding")!;
  const html = await page.text();
  expect(html).toContain('href="/control/coding.css"');
  expect(html).toContain('name="pullRequest" checked');
  expect(html).toContain('Register a device passkey before approving a task.');
  expect(page.headers.get("content-security-policy")).toBe(
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  const stylesheet = codingPageResponse("/control/coding.css")!;
  expect(stylesheet.headers.get("content-type")).toBe("text/css; charset=utf-8");
});

test("blocked merge opens its saved task, ordinary failures reject, and missing passkeys focus registration", async () => {
  const { codingPageResponse } = await import("../src/coding-page");
  const script = await codingPageResponse("/control/coding.js")!.text();
  const taskId = "task-cap-00000000-0000-4000-8000-000000000003";
  const merge = { repository: request.repository,
    sourceTaskId: "task-cap-00000000-0000-4000-8000-000000000001",
    pullRequestNumber: 17, headCommit: "e".repeat(40) };
  const element = () => ({ textContent: "", disabled: false, children: [] as any[],
    focused: false,
    classList: { values: new Set<string>(),
      add(value: string) { this.values.add(value); },
      remove(value: string) { this.values.delete(value); } },
    focus() { this.focused = true; },
    listeners: {} as Record<string, (...args: any[]) => any>,
    append(...children: any[]) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    addEventListener(type: string, callback: (...args: any[]) => any) { this.listeners[type] = callback; },
    querySelector() { return element(); } });
  const nodes = Object.fromEntries(["task", "status", "result", "history", "register"]
    .map((id) => [id, element()]));
  const document = { getElementById: (id: string) => nodes[id], createElement: element,
    createTextNode: (textContent: string) => ({ textContent }) };
  const storage = new Map<string, string>();
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) };
  const publicKey = { parseCreationOptionsFromJSON: (value: any) => value,
    parseRequestOptionsFromJSON: (value: any) => value };
  const calls: string[] = [];
  let ordinaryFailure = false;
  let missingCredential = false;
  let credentialCalls = 0;
  const fetcher = async (path: string) => {
    calls.push(path);
    if (path === "/control/api/v1/coding/tasks") return Response.json({ ok: true, tasks: [] });
    if (path === "/control/api/v1/webauthn/approve/options") return missingCredential
      ? Response.json({ ok: false, code: "WEBAUTHN_CREDENTIAL_REQUIRED" }, { status: 403 })
      : Response.json({ ok: true, options: {} });
    if (path === "/control/api/v1/webauthn/approve/verify") return Response.json({ ok: true, grant: {} });
    if (path === "/control/api/v1/coding/merge") return ordinaryFailure
      ? Response.json({ ok: false, code: "CODING_MERGE_UNAVAILABLE" }, { status: 503 })
      : Response.json({ ok: false, status: "blocked", taskId, code: "CODING_MERGE_BLOCKED" }, { status: 409 });
    if (path === `/control/api/v1/coding/tasks/${taskId}`) return Response.json({ ok: true,
      work: { action: "repository.merge", state: "blocked", request: merge, code: "CODING_MERGE_BLOCKED" } });
    return Response.json({ ok: false, status: "blocked", taskId, code: "ORDINARY_FAILURE" }, { status: 409 });
  };
  const api = new Function("document", "fetch", "window", "navigator", "localStorage", "PublicKeyCredential",
    script + "\nreturn { post, mergeButton };")(document, fetcher,
    { PublicKeyCredential: publicKey }, { credentials: { async get() { credentialCalls++; return { toJSON: () => ({}) }; } } },
    localStorage, publicKey);
  await api.mergeButton(merge).listeners.click();
  expect(storage.get("alice-coding-last-task")).toBe(taskId);
  expect(nodes.status!.textContent).toBe("Merge blocked: CODING_MERGE_BLOCKED");
  expect(nodes.result!.children.some((node) => node.textContent === "Check merge result")).toBe(true);
  expect(calls.filter((path) => path === "/control/api/v1/webauthn/approve/options")).toHaveLength(1);
  expect(calls.filter((path) => path === `/control/api/v1/coding/tasks/${taskId}`)).toHaveLength(1);
  ordinaryFailure = true;
  await expect(api.post("/control/api/v1/coding/merge", {})).rejects.toThrow("CODING_MERGE_UNAVAILABLE");
  await expect(api.post("/other", {})).rejects.toThrow("ORDINARY_FAILURE");
  missingCredential = true;
  await api.mergeButton(merge).listeners.click();
  expect(nodes.status!.textContent).toBe("Register a device passkey first, then approve this task again. Your task details are still here.");
  expect(nodes.register!.classList.values.has("needs-registration")).toBe(true);
  expect(nodes.register!.focused).toBe(true);
  expect(credentialCalls).toBe(1);
});
