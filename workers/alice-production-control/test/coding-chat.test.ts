import { expect, mock, spyOn, test } from "bun:test";
import { AuthorityLedger } from "../src/authority";
import { parseNativeCodingRequest, type NativeCodingRequest } from "../src/coding-chat";
import { aliceCodingArgumentHash, prepareAliceCodingTask } from "../src/coding-task";
import * as configModule from "../src/runtime-config";

mock.module("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: any) {} }, WorkflowEntrypoint: class {},
}));
mock.module("cloudflare:workflows", () => ({ NonRetryableError: class extends Error {} }));
const { AliceAuthority } = await import("../src/durable");
const requestId = "00000000-0000-4000-8000-000000000001";
const owner = `owner:sha256:${"a".repeat(64)}`;
const binding = { programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`, policyHash: `sha256:${"3".repeat(64)}` };
const manifest = `sha256:${"4".repeat(64)}`;
const input = (): NativeCodingRequest => ({ schemaVersion: "alice.native-coding.v1", requestId, issuedAt: Date.now(),
  message: { id: requestId, entityId: "00000000-0000-4000-8000-000000000002",
    roomId: "00000000-0000-4000-8000-000000000003", source: "discord", accountId: "default",
    externalId: "123456789012345678", externalMessageId: "223456789012345678", channelId: "323456789012345678" },
  request: { repository: "rndrntwrk/milaidy", baseCommit: "a".repeat(40), prompt: "Fix the owner command acknowledgment.", delivery: "pull-request" } });

async function fixture(options: { noOwner?: boolean; paused?: boolean; interrupted?: boolean; releaseMismatch?: boolean } = {}) {
  const ledger = AuthorityLedger.create(binding, 10000, options.releaseMismatch ? "release:different" : "release:test", 1, 1, manifest);
  if (!options.noOwner) {
    const challenge = "a".repeat(43);
    ledger.beginWebAuthnRegistration(owner, challenge, Date.now());
    ledger.completeWebAuthnRegistration(owner, challenge, { id: "owner-device-credential",
      publicKeyB64: "a".repeat(32), counter: 0, transports: ["usb"] }, Date.now());
  }
  if (options.paused) ledger.pause("coding", Date.now(), owner);
  const values = new Map<string, any>([["state", ledger.exportState()]]);
  const storage: any = {
    async get(key: string) { return structuredClone(values.get(key)); },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === "string") values.set(key, structuredClone(value));
      else for (const [name, item] of Object.entries(key)) values.set(name, structuredClone(item));
    },
    async transaction(callback: (transaction: any) => Promise<unknown>) { return callback(storage); },
    async setAlarm() {},
  };
  let work: any = null;
  let workflow: any = null;
  let creates = 0;
  let dependencyUnavailable = false;
  const evidence: any[] = [];
  const env: any = {
    ALICE_MODEL_DAILY_BUDGET_UNITS: "10000",
    ALICE_CONTROL_RECOVERY_TOKEN: "test-recovery-token-longer-than-thirty-two-bytes",
    ALICE_EVIDENCE_QUEUE_HMAC_KEY: "test-evidence-token-longer-than-thirty-two-bytes",
    ALICE_STATE_PLANE_SERVICE_TOKEN: "test-state-token-longer-than-thirty-two-bytes",
    ALICE_EVIDENCE_QUEUE: { async send(value: unknown) { evidence.push(value); } },
    ALICE_STATE_PLANE: { async fetch(request: Request) {
      if (dependencyUnavailable) throw new Error("state offline");
      const query: any = await request.json();
      expect(query.ownerId).toBe(owner);
      return Response.json({ ok: true, record: work ? { payload: work } : null });
    } },
    ALICE_CODING_WORKFLOW: {
      async get() {
        if (dependencyUnavailable) throw new Error("workflow offline");
        if (!workflow) throw new Error("instance.not_found");
        return { async status() { return workflow; } };
      },
      async create({ id, params }: any) {
        creates++;
        expect(id).toBe(`task-cap-${requestId}`);
        expect(params.actor).toBe(owner);
        expect(params.workItem.intent.action).toBe("coding.pr.create");
        expect(values.get(`coding-native/request/${requestId}`).grant.capabilityId).toBe(`cap-${requestId}`);
        if (options.interrupted && creates === 1) throw new Error("interrupted before creation");
        workflow = { status: "running" };
        return { id };
      },
    },
  };
  let authority = new AliceAuthority({ id: { name: "authority/global-safety-v1" }, storage,
    blockConcurrencyWhile: (callback: () => Promise<void>) => callback() } as any, env);
  const call = async (body?: unknown) => {
    const response = await authority.fetch(new Request(`https://alice.internal/coding/chat/${body ? "start" : `tasks/${requestId}`}`,
      body ? { method: "POST", body: JSON.stringify(body) } : {}));
    return { status: response.status, value: await response.json() as any };
  };
  return { values, call, evidence, creates: () => creates,
    setWork(value: unknown) { work = value; }, setWorkflow(value: unknown) { workflow = value; },
    setUnavailable(value: boolean) { dependencyUnavailable = value; },
    restart() { authority = new AliceAuthority({ id: { name: "authority/global-safety-v1" }, storage,
      blockConcurrencyWhile: (callback: () => Promise<void>) => callback() } as any, env); },
  };
}
async function withConfig(run: () => Promise<void>) {
  const config = spyOn(configModule, "loadRuntimeConfig").mockResolvedValue({ binding,
    deploymentManifestSha256: manifest, envelope: { issuedAt: new Date(1).toISOString(),
      release: { releaseEpoch: 1, rollbackBoundary: "release:test" } } } as any);
  try { await run(); } finally { config.mockRestore(); }
}

test("native owner starts an audited exact draft-PR task without invoking task passkey approval", async () => withConfig(async () => {
  const approval = spyOn(AuthorityLedger.prototype, "beginWebAuthnApproval");
  try {
    const f = await fixture();
    const body = input();
    expect((await f.call(body)).value).toMatchObject({ ok: true, requestId, taskId: `task-cap-${requestId}`, status: "queued" });
    expect(approval).not.toHaveBeenCalled();
    const state = f.values.get("state");
    const grant = state.capabilities[`cap-${requestId}`];
    expect(grant).toMatchObject({ owner, scope: "coding.pr.create", argumentHash: await aliceCodingArgumentHash(body.request), usedAt: null });
    expect(grant.expiresAt - body.issuedAt).toBeGreaterThanOrEqual(600_000);
    expect(f.evidence).toHaveLength(1);
    expect(f.evidence[0].record.details.nativeMessage).toEqual(body.message);
    expect(JSON.stringify(f.evidence)).not.toContain(body.request.prompt);
    const verifier = AuthorityLedger.restoreGlobal(state, 10000);
    const prepared = await prepareAliceCodingTask(body.request, grant);
    expect(verifier.authorize({ ...prepared.intent, action: "repository.merge" }, Date.now(), owner).allowed).toBe(false);
    expect(verifier.authorize(prepared.intent, Date.now(), owner).code).toBe("CAPABILITY_AUTHORIZED");
    expect(verifier.authorize({ ...prepared.intent, intentId: "intent-duplicate" }, Date.now(), owner).allowed).toBe(false);
    expect((await f.call(body)).value.status).toBe("running");
    expect(f.creates()).toBe(1);
    f.setWorkflow({ status: "unknown" });
    expect((await f.call()).value.status).toBe("unavailable");
    f.setWorkflow({ status: "complete" });
    f.setWork({ state: "queued" });
    expect((await f.call()).value.status).toBe("queued");
    f.setWork({ state: "completed", result: { pullRequestUrl: "https://github.com/rndrntwrk/milaidy/pull/1" } });
    expect((await f.call()).value.status).toBe("completed");
    delete state.capabilities[`cap-${requestId}`];
    f.values.set("state", state);
    f.restart();
    expect((await f.call(body)).value.status).toBe("completed");
    expect(f.creates()).toBe(1);
  } finally { approval.mockRestore(); }
}));

test("native admission rejects actor/scope injection, changed requests, message replay and stale new work", async () => withConfig(async () => {
  const f = await fixture();
  const body = input();
  expect((await f.call({ ...body, actor: owner })).status).toBe(400);
  expect((await f.call({ ...body, scope: "repository.merge" })).status).toBe(400);
  expect((await f.call({ ...body, request: { ...body.request, delivery: undefined } })).status).toBe(400);
  expect((await f.call({ ...body, issuedAt: Date.now() - 300_001 })).status).toBe(409);
  expect((await f.call(body)).status).toBe(202);
  expect((await f.call({ ...body, request: { ...body.request, prompt: "changed" } })).value.code).toBe("NATIVE_CODING_REQUEST_CONFLICT");
  expect((await f.call({ ...body, requestId: "00000000-0000-4000-8000-000000000009" })).value.code).toBe("NATIVE_CODING_MESSAGE_REPLAY");
  expect((await f.call({ ...body, issuedAt: Date.now() - 400_000 })).value.status).toBe("running");
  expect(f.creates()).toBe(1);
  expect(() => parseNativeCodingRequest({ ...body, message: { ...body.message, role: "OWNER" } })).toThrow("NATIVE_CODING_REQUEST_INVALID");
}));

test("native grant requires configured owner, active release and unpaused coding", async () => withConfig(async () => {
  const missing = await fixture({ noOwner: true });
  expect((await missing.call(input())).value.code).toBe("NATIVE_CODING_OWNER_UNCONFIGURED");
  expect(missing.creates()).toBe(0);
  const paused = await fixture({ paused: true });
  expect((await paused.call(input())).value.code).toBe("NATIVE_CODING_PAUSED");
  expect(paused.creates()).toBe(0);
  const f = await fixture({ releaseMismatch: true });
  expect((await f.call(input())).value.ok).toBe(false);
  expect(f.creates()).toBe(0);
}));

test("interrupted native start resumes the same grant/task; dependency outage and expired grant do not retry", async () => withConfig(async () => {
  const f = await fixture({ interrupted: true });
  const body = input();
  expect((await f.call(body)).value.code).toBe("CODING_TASK_NOT_FOUND");
  const grant = structuredClone(f.values.get("state").capabilities[`cap-${requestId}`]);
  f.restart();
  f.setUnavailable(true);
  expect((await f.call(body)).value.code).toBe("CODING_TASK_STATE_UNAVAILABLE");
  expect(f.creates()).toBe(1);
  f.setUnavailable(false);
  expect((await f.call(body)).value.status).toBe("queued");
  expect(f.creates()).toBe(2);
  expect(f.values.get("state").capabilities[`cap-${requestId}`]).toEqual(grant);
  expect(f.evidence).toHaveLength(1);
  f.setWorkflow(null);
  delete f.values.get("state").capabilities[`cap-${requestId}`];
  f.restart();
  expect((await f.call(body)).value.code).toBe("NATIVE_CODING_GRANT_UNAVAILABLE");
  expect(f.values.get("state").capabilities[`cap-${requestId}`]).toBeUndefined();
  const clock = spyOn(Date, "now").mockReturnValue(grant.expiresAt + 1);
  try {
    expect((await f.call({ ...body, issuedAt: Date.now() })).value.status).toBe("expired");
    expect(f.creates()).toBe(2);
  } finally { clock.mockRestore(); }
}));
