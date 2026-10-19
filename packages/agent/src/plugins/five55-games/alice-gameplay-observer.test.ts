import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { AliceGameplayObserver } from "./alice-gameplay-observer.js";
import { AliceGameplayMemoryPersistence } from "./alice-gameplay-memory-persistence.js";
import { AliceReactionBridge } from "./alice-reaction-bridge.js";

function fact(sequence: number, kind = "checkpoint", extra = {}) {
  const value = {
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
    ...extra,
  };
  return {
    ...value,
    digest: createHash("sha256")
      .update(
        JSON.stringify([
          1,
          value.sessionId,
          value.dispatchId,
          value.sourceId,
          value.gameId,
          value.runId,
          value.sequence,
          value.observedAt,
          value.kind,
          value.data,
        ]),
      )
      .digest("hex"),
  };
}
function setup() {
  const memories = new Map();
  const events: any[] = [];
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
  };
  const persistence = new AliceGameplayMemoryPersistence(
    runtime as any,
    "alice-room",
  );
  let fail = false;
  const bridge = new AliceReactionBridge({
    persistence,
    streamControl: {
      async broadcastEvent(topic, payload, sessionId, dispatchId) {
        events.push({ topic, payload, sessionId, dispatchId });
        if (fail) throw Error("relay failed");
        return { ok: true, sent: true, eventId: "event-1" };
      },
    },
    broadcastWs(payload) {
      events.push(payload);
    },
  });
  const make = () =>
    new AliceGameplayObserver({ sessionId: "session-1", persistence, bridge });
  return {
    make,
    memories,
    events,
    runtime,
    setFail(value: boolean) {
      fail = value;
    },
  };
}
test("persisted run fence selects existing reactions and dedupes across recreation with identical companion payload", async () => {
  const s = setup();
  const observer = s.make();
  await observer.observe(fact(1, "run_started"));
  const checkpoint = fact(2);
  const result = await observer.observe(checkpoint);
  expect(result.delivery).toMatchObject({
    ok: true,
    sent: true,
    eventId: "event-1",
  });
  expect(s.events).toEqual([
    {
      topic: "emote",
      payload: {
        emoteId: "dance-happy",
        path: "/animations/emotes/dance-happy.glb.gz",
        duration: 4,
        loop: false,
      },
      sessionId: "session-1",
      dispatchId: "dispatch-1",
    },
    {
      type: "emote",
      emoteId: "dance-happy",
      path: "/animations/emotes/dance-happy.glb.gz",
      duration: 4,
      loop: false,
    },
  ]);
  expect((await s.make().observe(checkpoint)).duplicate).toBe(true);
  expect(s.events).toHaveLength(2);
  await observer.observe(fact(3, "impact"));
  expect(s.events[2].payload.emoteId).toBe("looking-around");
  await observer.observe(fact(4, "lost"));
  expect(s.events[4].payload.emoteId).toBe("sorrow");
  await expect(
    observer.observe(fact(5, "checkpoint", { runId: "old-run" })),
  ).rejects.toThrow();
  await expect(observer.observe(fact(3, "checkpoint"))).rejects.toThrow();
});
test("persistence failure prevents delivery, and failed Stream retries create no duplicate reaction memory or local animation", async () => {
  const s = setup();
  const observer = s.make();
  await observer.observe(fact(1, "run_started"));
  s.setFail(true);
  const observation = fact(2);
  await expect(observer.observe(observation)).rejects.toThrow("relay failed");
  const count = s.memories.size;
  s.setFail(false);
  await s.make().observe(observation);
  expect(s.memories.size).toBe(count);
  expect(s.events.filter((e) => e.type === "emote")).toHaveLength(1);
  s.runtime.updateMemory = async () => {
    throw Error("persistence failed");
  };
  const before = s.events.length;
  await expect(observer.observe(fact(3))).rejects.toThrow("persistence failed");
  expect(s.events).toHaveLength(before);
});
test("rejects invalid digest, unconfigured session, missing run and oversized/unknown observation data", async () => {
  const s = setup();
  const observer = s.make();
  for (const value of [
    fact(1),
    { ...fact(1, "run_started"), digest: "bad" },
    fact(1, "run_started", { sessionId: "other" }),
    fact(1, "run_started", { data: { other: true } }),
    fact(1, "run_started", { observedAt: Date.now() - 31000 }),
  ]) {
    await expect(observer.observe(value)).rejects.toThrow();
  }
  expect(s.memories.size).toBe(0);
  expect(s.events).toHaveLength(0);
});

test("a fresh document may start a new run at sequence one, while stale timestamps stay fenced", async () => {
  const s = setup();
  const now = Date.now();
  await s.make().observe(fact(1, "run_started", { observedAt: now }));
  await s.make().observe(fact(2, "checkpoint", { observedAt: now }));
  await expect(
    s
      .make()
      .observe(fact(1, "run_started", { runId: "run-2", observedAt: now - 1 })),
  ).rejects.toThrow();
  await s
    .make()
    .observe(fact(1, "run_started", { runId: "run-2", observedAt: now + 1 }));
  expect(
    (
      await s
        .make()
        .observe(fact(2, "checkpoint", { runId: "run-2", observedAt: now + 1 }))
    ).accepted,
  ).toBe(true);
  const state = [...s.memories.values()].find(
    (m) => m.content.metadata.kind === "alice.gameplay.observation.v1",
  );
  expect(state?.content.metadata).toMatchObject({
    runId: "run-2",
    observationKind: "checkpoint",
  });
});
