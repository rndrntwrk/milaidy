/**
 * Action role gating tests — REAL integration tests.
 *
 * Tests the access control system using a real PGLite-backed runtime
 * with real entities and roles instead of mocking hasOwnerAccess/hasAdminAccess.
 *
 * The actions validate role access through the real security module,
 * which reads entity roles from the database.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { ChannelType } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";

import { restartAction } from "./restart";
import { skillCommandAction, addRegisteredSkillSlug, clearRegisteredSkillSlugs } from "./skill-command";
import { goLiveAction, goOfflineAction } from "./stream-control";
import { setUserNameAction } from "./set-user-name";
import { terminalAction } from "./terminal";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;
/** Room ID in a world where entities default to GUEST (no roles assigned). */
let gatedRoomId: UUID;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());

  // Create a world + room so role checks can resolve a world context.
  // Entities not listed in the world's roles metadata default to GUEST.
  const worldId = "a0000000-0000-4000-8000-000000000001" as UUID;
  await runtime.ensureWorldExists({
    id: worldId,
    name: "GatingTestWorld",
    agentId: runtime.agentId,
    serverId: worldId,
    metadata: { ownership: { ownerId: runtime.agentId } },
  });
  gatedRoomId = "a0000000-0000-4000-8000-000000000002" as UUID;
  await runtime.ensureRoomExists({
    id: gatedRoomId,
    name: "gating-test",
    source: "test",
    type: ChannelType.GROUP,
    worldId,
  });
}, 180_000);

afterAll(async () => {
  await cleanup();
});

describe("action role gating", () => {
  beforeEach(() => {
    clearRegisteredSkillSlugs();
  });

  afterEach(() => {
    clearRegisteredSkillSlugs();
  });

  it("requires owner access for restart — non-owner gets denied", async () => {
    // Use a random entityId that is NOT the agent's canonical owner
    const nonOwnerEntityId = "non-owner-entity-00000000" as UUID;

    const valid = await restartAction.validate?.(
      runtime,
      { content: { text: "restart please" }, entityId: nonOwnerEntityId } as never,
      {} as never,
    );
    // Non-owner should fail validation
    expect(valid).toBe(false);

    const result = await restartAction.handler?.(
      runtime,
      {
        entityId: nonOwnerEntityId,
        roomId: "room-1" as UUID,
        worldId: "world-1" as UUID,
        content: { text: "restart please" },
      } as never,
      {} as never,
      {} as never,
    );

    expect(result).toMatchObject({
      success: false,
    });
  });

  it("requires owner access for terminal execution — non-owner denied", async () => {
    const nonOwnerEntityId = "non-owner-entity-00000001" as UUID;

    const valid = await terminalAction.validate?.(
      runtime,
      { content: { text: "run ls -la" }, entityId: nonOwnerEntityId } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const result = await terminalAction.handler?.(
      runtime,
      {
        entityId: nonOwnerEntityId,
        content: { text: "run ls -la" },
      } as never,
      {} as never,
      { parameters: { command: "ls -la" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
    });
  });

  it("requires owner access to save the owner name — non-owner denied", async () => {
    const nonOwnerEntityId = "non-owner-entity-00000002" as UUID;

    const valid = await setUserNameAction.validate?.(
      runtime,
      {
        entityId: nonOwnerEntityId,
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const result = await setUserNameAction.handler?.(
      runtime,
      {
        entityId: nonOwnerEntityId,
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
      { parameters: { name: "Sam" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
    });
  });

  it("requires admin access for slash skill commands — non-admin denied", async () => {
    addRegisteredSkillSlug("github");
    const nonAdminEntityId = "non-admin-entity-00000003" as UUID;

    const valid = await skillCommandAction.validate?.(
      runtime,
      { entityId: nonAdminEntityId, roomId: gatedRoomId, content: { text: "/github open an issue" } } as never,
    );
    expect(valid).toBe(false);
  });

  it("requires owner access for stream control — non-owner denied", async () => {
    const nonOwnerEntityId = "non-owner-entity-00000004" as UUID;

    const valid = await goLiveAction.validate?.(
      runtime,
      { entityId: nonOwnerEntityId } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const deny = await goOfflineAction.handler?.(
      runtime,
      { entityId: nonOwnerEntityId } as never,
      {} as never,
      {} as never,
    );
    expect(deny).toMatchObject({
      success: false,
    });
  });
});
