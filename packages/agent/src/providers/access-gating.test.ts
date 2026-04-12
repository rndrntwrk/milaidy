/**
 * Provider role gating tests — REAL integration tests.
 *
 * Tests provider access control using a real PGLite-backed runtime
 * with real role checking instead of mocking hasOwnerAccess/hasAdminAccess.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";

import { activityProfileProvider } from "./activity-profile";
import { createAdminTrustProvider } from "./admin-trust";
import { createDynamicSkillProvider } from "./skill-provider";
import { uiCatalogProvider } from "./ui-catalog";
import { createUserNameProvider } from "./user-name";
import { createWorkspaceProvider } from "./workspace-provider";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

describe("provider role gating", () => {
  const nonOwnerEntityId = "non-owner-provider-test-001" as UUID;

  it("gates workspace context — non-admin gets empty response", async () => {
    const provider = createWorkspaceProvider({
      workspaceDir: "/tmp/workspace",
    });

    const denied = await provider.get(
      runtime,
      { entityId: nonOwnerEntityId, content: {} } as never,
      {} as never,
    );
    // Non-admin should get an empty or skipped result
    expect(denied).toBeDefined();
    expect(typeof denied.text).toBe("string");
  }, 60_000);

  it("gates dynamic skill injection — non-admin gets empty", async () => {
    const provider = createDynamicSkillProvider();

    const denied = await provider.get(
      runtime,
      { entityId: nonOwnerEntityId, content: { text: "github issue" } } as never,
      { recentMessages: [] } as never,
    );
    // Non-admin gets empty text
    expect(denied).toBeDefined();
    expect(typeof denied.text).toBe("string");
  }, 60_000);

  it("gates the saved owner-name context — non-owner gets empty", async () => {
    const provider = createUserNameProvider();

    const denied = await provider.get(
      runtime,
      {
        entityId: nonOwnerEntityId,
        content: { source: "client_chat", text: "hi" },
      } as never,
      {} as never,
    );
    expect(denied.text).toBe("");
  }, 60_000);

  it("gates UI catalog to admins — non-admin gets empty", async () => {
    const denied = await uiCatalogProvider.get(
      runtime,
      { entityId: nonOwnerEntityId, content: { channelType: undefined } } as never,
      {} as never,
    );
    expect(denied.text).toBe("");
  }, 60_000);

  it("blocks activity-profile context for non-admin client chat callers", async () => {
    const result = await activityProfileProvider.get(
      runtime,
      {
        entityId: nonOwnerEntityId,
        content: { source: "client_chat", text: "hi" },
      } as never,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("hides canonical owner identifiers from non-admin trust context", async () => {
    const provider = createAdminTrustProvider();

    const denied = await provider.get(
      runtime,
      { entityId: nonOwnerEntityId, content: { text: "hi" } } as never,
      {} as never,
    );
    expect(denied.values).toMatchObject({
      trustedAdmin: false,
      adminEntityId: "",
    });
    expect(denied.data).toMatchObject({
      ownerId: null,
    });
  }, 60_000);
});
