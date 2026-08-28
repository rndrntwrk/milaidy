import { describe, expect, it } from "vitest";

import {
  type AliceCompanionStageState,
  createAliceCompanionStageStore,
  createCompanionStageStoreFromEnvironment,
} from "./alice-companion-state-store";

const ownerId = "owner-production-001";
const state: AliceCompanionStageState = {
  camera: { zoom: 0.75, yaw: 0.5, pitch: -0.25, pan: 1.5 },
};

function durableStateService() {
  let record: Record<string, unknown> | null = null;
  const operations: Record<string, unknown>[] = [];
  return {
    operations,
    fetch: async (request: Request) => {
      expect(request.headers.get("authorization")).toBeNull();
      const operation = (await request.json()) as Record<string, unknown>;
      operations.push(structuredClone(operation));
      if (operation.operation === "record.get") {
        return Response.json({ ok: true, record });
      }
      if (operation.operation === "record.put") {
        record = {
          ...operation,
          payloadSha256: `sha256:${"1".repeat(64)}`,
          revision: record ? 2 : 1,
        };
        return Response.json({ ok: true, record });
      }
      return Response.json(
        { ok: false, code: "STATE_OPERATION_INVALID" },
        { status: 400 },
      );
    },
  };
}

describe("Alice Companion durable stage store", () => {
  it("restores the exact Companion and broadcast stage after a container replacement", async () => {
    const service = durableStateService();
    const firstProcess = createAliceCompanionStageStore({
      ownerId,
      statePlaneUrl: "http://alice-state-plane.internal/v1/companion-state",
      fetchImpl: service.fetch,
    });
    await firstProcess.write(state, 1_777_000_000_000);

    const replacementProcess = createAliceCompanionStageStore({
      ownerId,
      statePlaneUrl: "http://alice-state-plane.internal/v1/companion-state",
      fetchImpl: service.fetch,
    });
    expect(await replacementProcess.read()).toEqual(state);
    expect(service.operations.map((operation) => operation.operation)).toEqual([
      "record.put",
      "record.get",
    ]);
    expect(service.operations[0]).toMatchObject({
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId,
      payload: {
        schemaVersion: "alice.companion-stage-state.v1",
        state,
      },
    });
  });

  it("fails closed on partial cloud configuration and malformed durable records", async () => {
    expect(() => createAliceCompanionStageStore({ ownerId })).toThrow(
      "ALICE_COMPANION_STATE_CONFIG_INVALID",
    );
    const store = createAliceCompanionStageStore({
      ownerId,
      statePlaneUrl: "http://alice-state-plane.internal/v1/companion-state",
      fetchImpl: async () =>
        Response.json({
          ok: true,
          record: {
            payload: {
              schemaVersion: "alice.companion-stage-state.v0",
              state,
            },
          },
        }),
    });
    await expect(store.read()).rejects.toThrow("ALICE_COMPANION_STATE_INVALID");
  });

  it("uses a dedicated Companion state URL and never reuses the Eliza database URL", () => {
    expect(() =>
      createCompanionStageStoreFromEnvironment({
        ALICE_STATE_OWNER_ID: ownerId,
        ALICE_STATE_PLANE_URL:
          "http://alice-state-plane.internal/v1/eliza-database",
      } as NodeJS.ProcessEnv),
    ).toThrow("ALICE_COMPANION_STATE_CONFIG_INVALID");

    expect(() =>
      createCompanionStageStoreFromEnvironment({
        ALICE_STATE_OWNER_ID: ownerId,
        ALICE_STATE_PLANE_URL:
          "http://alice-state-plane.internal/v1/eliza-database",
        ALICE_COMPANION_STATE_URL:
          "http://alice-state-plane.internal/v1/companion-state",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("uses a distinct idempotency claim when the same stage is intentionally written later", async () => {
    const service = durableStateService();
    const store = createAliceCompanionStageStore({
      ownerId,
      statePlaneUrl: "http://alice-state-plane.internal/v1/companion-state",
      fetchImpl: service.fetch,
    });
    await store.write(state, 1_777_000_000_000);
    await store.write(state, 1_777_000_000_001);
    expect(service.operations[0]?.idempotencyKey).not.toBe(
      service.operations[1]?.idempotencyKey,
    );
  });
});
