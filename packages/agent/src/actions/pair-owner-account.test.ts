import type {
  Entity,
  IAgentRuntime,
  Memory,
  Relationship,
  UUID,
} from "@elizaos/core";
import { createUniqueUuid } from "@elizaos/core";
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
  const relationships: Relationship[] = [];
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
    getRelationships: async () => relationships,
    createRelationship: async (relationship: Relationship) => {
      relationships.push(relationship);
      return true;
    },
    reportError() {},
  } as unknown as IAgentRuntime;
  service = new OwnerBindingService(runtime);
  return { runtime, service, entities, relationships };
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
  it("preserves an explicitly retained verified Telegram account when pairing the primary", async () => {
    const { runtime, service, entities, relationships } = fixture();
    const old = service.beginOwnerBind({ connector: "telegram" });
    await service.verifyOwnerBindFromConnector({
      connector: "telegram",
      externalId: "424242",
      displayHandle: "alternate",
      code: old.code,
    });
    const alternateId = createUniqueUuid(
      runtime,
      `owner-paired:${OWNER_ID}:telegram:424242`,
    );
    entities.set(alternateId, {
      id: alternateId,
      agentId: AGENT_ID,
      names: ["saved alternate"],
      metadata: { retainedPreference: "keep", telegram: { userId: "424242" } },
    });
    const request = message(OWNER_ID);
    request.content.text = "pair my telegram and keep both accounts";
    const issued = await pairOwnerAccountAction.handler(runtime, request);
    const code = issued?.text?.match(/\/eliza_pair (\d{6})/)?.[1];
    expect(code).toBeDefined();
    expect(
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "434343",
        displayHandle: "primary",
        code: code!,
      }),
    ).toEqual({ success: true });
    expect(entities.get(OWNER_ID)?.metadata?.telegram).toMatchObject({
      userId: "434343",
    });
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({
      targetEntityId: OWNER_ID,
      tags: ["identity_link"],
      metadata: { status: "confirmed" },
    });
    expect(
      entities.get(relationships[0].sourceEntityId)?.metadata?.telegram,
    ).toMatchObject({ userId: "424242", username: "alternate" });
    expect(entities.get(alternateId)).toMatchObject({
      names: ["saved alternate"],
      metadata: { retainedPreference: "keep" },
    });
  });

  it("replaces the previous primary without retaining it unless explicitly requested", async () => {
    const { service, entities, relationships } = fixture();
    for (const externalId of ["424242", "434343"]) {
      const { code } = service.beginOwnerBind({ connector: "telegram" });
      expect(
        await service.verifyOwnerBindFromConnector({
          connector: "telegram",
          externalId,
          displayHandle: "owner",
          code,
        }),
      ).toEqual({ success: true });
    }
    expect(entities.get(OWNER_ID)?.metadata?.telegram).toMatchObject({
      userId: "434343",
    });
    expect(relationships).toHaveLength(0);
  });

  it("does not infer retention from a planner parameter or a negated owner request", async () => {
    for (const text of [
      "pair my telegram",
      "pair my telegram but don't keep the old account",
      "pair my telegram but not keep the old account",
      "pair my telegram and keep old chats",
    ]) {
      const { runtime, service, relationships } = fixture();
      const old = service.beginOwnerBind({ connector: "telegram" });
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "424242",
        displayHandle: "old",
        code: old.code,
      });
      const request = message(OWNER_ID);
      request.content.text = text;
      const issued = await pairOwnerAccountAction.handler(
        runtime,
        request,
        undefined,
        { parameters: { retainExistingAccount: true } } as never,
      );
      const code = issued?.text?.match(/\/eliza_pair (\d{6})/)?.[1];
      expect(code).toBeDefined();
      expect(
        await service.verifyOwnerBindFromConnector({
          connector: "telegram",
          externalId: "434343",
          displayHandle: "new",
          code: code!,
        }),
      ).toEqual({ success: true });
      expect(relationships).toHaveLength(0);
    }
  });

  it("does not replace the primary when preserving its verified link fails", async () => {
    const { runtime, service, entities } = fixture();
    const previous = service.beginOwnerBind({ connector: "telegram" });
    await service.verifyOwnerBindFromConnector({
      connector: "telegram",
      externalId: "424242",
      displayHandle: "alternate",
      code: previous.code,
    });
    runtime.createRelationship = async () => false;
    const { code } = service.beginOwnerBind({
      connector: "telegram",
      retainExistingAccount: true,
    });
    expect(
      await service.verifyOwnerBindFromConnector({
        connector: "telegram",
        externalId: "434343",
        displayHandle: "primary",
        code,
      }),
    ).toEqual({ success: false, error: "binding_write_failed" });
    expect(entities.get(OWNER_ID)?.metadata?.telegram).toMatchObject({
      userId: "424242",
    });
  });

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
