import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../security/access.js", () => ({
  hasOwnerAccess: vi.fn(),
}));

vi.mock("../lifeops/owner-profile.js", () => ({
  normalizeLifeOpsOwnerProfilePatch: vi.fn((value: Record<string, unknown>) => {
    const next: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value ?? {})) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        next[key] = entry.trim();
      }
    }
    return next;
  }),
  persistConfiguredOwnerName: vi.fn(),
  updateLifeOpsOwnerProfile: vi.fn(),
}));

import { updateOwnerProfileAction } from "./update-owner-profile.js";
import {
  persistConfiguredOwnerName,
  updateLifeOpsOwnerProfile,
} from "../lifeops/owner-profile.js";
import { hasOwnerAccess } from "../security/access.js";

describe("UPDATE_OWNER_PROFILE action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hasOwnerAccess).mockResolvedValue(true);
    vi.mocked(updateLifeOpsOwnerProfile).mockResolvedValue({
      name: "Shaw",
      relationshipStatus: "single",
      partnerName: "n/a",
      orientation: "n/a",
      gender: "n/a",
      age: "34",
      location: "Denver",
      updatedAt: "2026-04-12T00:00:00.000Z",
    });
    vi.mocked(persistConfiguredOwnerName).mockResolvedValue(true);
  });

  it("rejects non-owner callers", async () => {
    vi.mocked(hasOwnerAccess).mockResolvedValue(false);

    const result = await updateOwnerProfileAction.handler?.(
      {} as never,
      { entityId: "guest-1" } as never,
      undefined,
      { parameters: { location: "Denver" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
      data: { error: "PERMISSION_DENIED" },
    });
  });

  it("updates any subset of profile fields and syncs the stored owner name", async () => {
    const result = await updateOwnerProfileAction.handler?.(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1" } as never,
      undefined,
      {
        parameters: {
          name: "Shaw",
          relationshipStatus: "single",
          age: "34",
          location: "Denver",
        },
      } as never,
    );

    expect(updateLifeOpsOwnerProfile).toHaveBeenCalledWith(
      { agentId: "agent-1" },
      {
        name: "Shaw",
        relationshipStatus: "single",
        age: "34",
        location: "Denver",
      },
    );
    expect(persistConfiguredOwnerName).toHaveBeenCalledWith("Shaw");
    expect(result).toMatchObject({
      success: true,
      data: {
        updatedFields: ["name", "relationshipStatus", "age", "location"],
        nameSyncSaved: true,
      },
    });
  });

  it("does not attempt a config sync when the name is unchanged", async () => {
    await updateOwnerProfileAction.handler?.(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1" } as never,
      undefined,
      { parameters: { location: "New York" } } as never,
    );

    expect(updateLifeOpsOwnerProfile).toHaveBeenCalledWith(
      { agentId: "agent-1" },
      { location: "New York" },
    );
    expect(persistConfiguredOwnerName).not.toHaveBeenCalled();
  });
});
