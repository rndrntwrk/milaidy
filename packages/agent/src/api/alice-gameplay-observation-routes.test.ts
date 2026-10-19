import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { handleAliceGameplayObservationRoutes } from "./alice-gameplay-observation-routes.js";
const env = {
  ALICE_GAMEPLAY_OBSERVER_TOKEN: "x".repeat(32),
  ALICE_GAMEPLAY_OBSERVER_SESSION_ID: "session-1",
};
async function call(
  auth?: string,
  method = "POST",
  pathname = "/api/alice/gameplay-observation",
) {
  const req = Readable.from(["{}"]) as any;
  req.headers = { authorization: auth };
  let status = 200;
  let body: any;
  const handled = await handleAliceGameplayObservationRoutes({
    req,
    res: {} as any,
    method,
    pathname,
    env,
    json(_r, v, s = 200) {
      status = s;
      body = v;
    },
  });
  return { handled, status, body };
}
test("exact private route denies anonymous and owner-only requests, never broadens other routes", async () => {
  expect((await call()).status).toBe(401);
  expect((await call("Bearer owner-token")).status).toBe(401);
  expect(
    (await call(`Bearer ${env.ALICE_GAMEPLAY_OBSERVER_TOKEN}`)).status,
  ).toBe(503);
  expect((await call(undefined, "GET")).status).toBe(405);
  expect((await call(undefined, "POST", "/api/emote")).handled).toBe(false);
});

test("authenticated route revalidates digest, current dispatch and durable delivery before acceptance", async () => {
  const { createHash } = await import("node:crypto");
  const memories = new Map();
  const events: unknown[] = [];
  let dispatch = "dispatch-1";
  const runtime = {
    agentId: "alice",
    async getMemoryById(id: string) {
      return memories.get(id) ?? null;
    },
    async createMemory(m: any) {
      memories.set(m.id, m);
    },
    async updateMemory(m: any) {
      memories.set(m.id, m);
    },
    getService() {
      return stream;
    },
  };
  const stream = {
    async getStreamStatus() {
      return { jobId: dispatch, status: "live" };
    },
    async broadcastEvent(_t: string, p: unknown, _s: string, d: string) {
      events.push({ payload: p, dispatchId: d });
      return { ok: true, sent: true, eventId: "event-1" };
    },
  };
  const ws = (p: unknown) => events.push(p);
  async function submit(
    sequence: number,
    kind: string,
    digestOverride?: string,
  ) {
    const v = {
      version: 1,
      sessionId: "session-1",
      dispatchId: "dispatch-1",
      sourceId: "source-1",
      gameId: "555drive",
      runId: "run-1",
      sequence,
      observedAt: Date.now(),
      kind,
      data: {},
    };
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          1,
          v.sessionId,
          v.dispatchId,
          v.sourceId,
          v.gameId,
          v.runId,
          sequence,
          v.observedAt,
          kind,
          {},
        ]),
      )
      .digest("hex");
    const req = Readable.from([
      JSON.stringify({ ...v, digest: digestOverride ?? digest }),
    ]) as any;
    req.headers = {
      authorization: `Bearer ${env.ALICE_GAMEPLAY_OBSERVER_TOKEN}`,
    };
    let status = 200;
    let body: any;
    await handleAliceGameplayObservationRoutes({
      req,
      res: {} as any,
      method: "POST",
      pathname: "/api/alice/gameplay-observation",
      env,
      runtime,
      broadcastWs: ws,
      json(_r, b, s = 200) {
        status = s;
        body = b;
      },
    });
    return { status, body };
  }
  expect((await submit(1, "run_started", "bad")).status).toBe(400);
  expect((await submit(1, "run_started")).body).toMatchObject({
    accepted: true,
    delivery: null,
  });
  dispatch = "other";
  expect((await submit(2, "checkpoint")).status).toBe(409);
  expect(events).toHaveLength(0);
  dispatch = "dispatch-1";
  const accepted = await submit(2, "checkpoint");
  expect(accepted.status).toBe(200);
  expect(accepted.body.delivery).toMatchObject({
    eventId: "event-1",
    sent: true,
  });
  expect(events).toHaveLength(2);
});
