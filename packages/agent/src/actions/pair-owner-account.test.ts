import type { Entity, IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { enforceAliceActionExecutionBoundary } from "../runtime/alice-high-risk-action-boundary.ts";
import { OwnerBindingService } from "../services/owner-binding.ts";
import { pairOwnerAccountAction } from "./pair-owner-account.ts";

const AGENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as UUID;
const OWNER_ID = "eafda9b1-f64b-0b0a-9b1a-e6f589f42b44" as UUID;
const STRANGER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc" as UUID;

// Adapted from the pinned native owner-binding and pair-owner-account tests.
// Crypto, verification, and the real owner-role check remain unmocked.
function fixture() {
  const entities = new Map<string, Entity>();
  let service: OwnerBindingService;
  const runtime = {
    agentId: AGENT_ID,
    character: { name: "Alice" },
    getSetting: (key: string) =>
      key === "ELIZA_ADMIN_ENTITY_ID" ? OWNER_ID : undefined,
    getService: (type: string) =>
      type === "OWNER_BIND_VERIFY" ? service : null,
    getRoom: async () => null,
    getEntityById: async (id: UUID) => entities.get(id) ?? null,
    createEntity: async (entity: Entity) => {
      entities.set(entity.id as string, entity);
      return true;
    },
    updateEntity: async (entity: Entity) => {
      entities.set(entity.id as string, entity);
    },
    getRelationships: async () => [],
    reportError() {},
  } as unknown as IAgentRuntime;
  service = new OwnerBindingService(runtime);
  return { runtime, service, entities };
}

function message(entityId: UUID): Memory {
  return {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" as UUID,
    entityId,
    roomId: "dddddddd-dddd-dddd-dddd-dddddddddddd" as UUID,
    content: { text: "pair my telegram", source: "client_chat" },
  } as Memory;
}

describe("Alice native owner pairing", () => {
  it("issues a Telegram pairing code only for the canonical owner", async () => {
    const { runtime } = fixture();
    const action = enforceAliceActionExecutionBoundary(pairOwnerAccountAction, {
      ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
      ALICE_RUNTIME_PROFILE: "full-gated",
    });
    const denied = await action.handler(runtime, message(STRANGER_ID));
    expect(denied).toMatchObject({
      success: false,
      values: { error: "NOT_OWNER" },
    });
    expect(denied?.text).not.toMatch(/\d{6}/);
    const issued = await action.handler(runtime, message(OWNER_ID));
    expect(issued).toMatchObject({
      success: true,
      data: { connector: "telegram" },
    });
    expect(issued?.text).toMatch(/\/eliza_pair \d{6}/);
  });

  it("merges verified Telegram identity without dropping owner metadata", async () => {
    const { service, entities } = fixture();
    entities.set(OWNER_ID, {
      id: OWNER_ID,
      names: ["Owner"],
      agentId: AGENT_ID,
      metadata: { default: { name: "Owner" }, telegram: { retained: "yes" } },
    });
    const { code } = service.beginOwnerBind({ connector: "telegram" });
    expect(
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "424242",
        displayHandle: "owner_tg",
        code,
      }),
    ).toEqual({ success: true });
    expect(entities.get(OWNER_ID)).toMatchObject({
      id: OWNER_ID,
      names: ["Owner"],
      agentId: AGENT_ID,
      metadata: {
        default: { name: "Owner" },
        telegram: {
          retained: "yes",
          userId: "424242",
          id: "424242",
          username: "owner_tg",
        },
      },
    });
  });

  it("rejects a replay without rebinding the owner to another Telegram user", async () => {
    const { service, entities } = fixture();
    const { code } = service.beginOwnerBind({ connector: "telegram" });
    expect(
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "424242",
        displayHandle: "owner_tg",
        code,
      }),
    ).toEqual({ success: true });
    expect(
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "666666",
        displayHandle: "imposter",
        code,
      }),
    ).toEqual({ success: false, error: "no_pending_bind" });
    expect(entities.get(OWNER_ID)?.metadata?.telegram).toMatchObject({
      userId: "424242",
    });
  });
});
