import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime.js", () => ({
  ensureLifeOpsSchedulerTask: vi.fn(),
  LIFEOPS_TASK_NAME: "LIFEOPS_SCHEDULER",
  LIFEOPS_TASK_TAGS: ["queue", "repeat", "lifeops"],
}));

import { ensureLifeOpsSchedulerTask } from "./runtime.js";
import {
  readLifeOpsOwnerProfile,
  resolveLifeOpsOwnerProfile,
  updateLifeOpsOwnerProfile,
} from "./owner-profile.js";

function mockFetchJson(payload: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => payload,
    })),
  );
}

describe("lifeops owner profile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchJson({});
  });

  it("uses config-backed name and n/a defaults when metadata is missing", () => {
    const profile = resolveLifeOpsOwnerProfile(null, "Shaw");

    expect(profile).toEqual({
      name: "Shaw",
      relationshipStatus: "n/a",
      partnerName: "n/a",
      orientation: "n/a",
      gender: "n/a",
      age: "n/a",
      location: "n/a",
      updatedAt: null,
    });
  });

  it("reads the configured owner name when no LifeOps task exists yet", async () => {
    mockFetchJson({ ui: { ownerName: "Shaw" } });
    const runtime = {
      agentId: "agent-1",
      getTasks: vi.fn(async () => []),
    } as const;

    const profile = await readLifeOpsOwnerProfile(runtime as never);

    expect(runtime.getTasks).toHaveBeenCalledWith({
      agentIds: ["agent-1"],
      tags: ["queue", "repeat", "lifeops"],
    });
    expect(profile.name).toBe("Shaw");
    expect(profile.location).toBe("n/a");
  });

  it("updates only the supplied fields and preserves scheduler metadata", async () => {
    vi.mocked(ensureLifeOpsSchedulerTask).mockResolvedValue("task-1" as never);
    mockFetchJson({ ui: { ownerName: "Shaw" } });

    const updateTask = vi.fn(async () => {});
    const runtime = {
      agentId: "agent-1",
      getTasks: vi.fn(async () => [
        {
          id: "task-1",
          name: "LIFEOPS_SCHEDULER",
          metadata: {
            lifeopsScheduler: { kind: "runtime_runner", version: 1 },
            ownerProfile: {
              name: "Shaw",
              relationshipStatus: "single",
              partnerName: "n/a",
              orientation: "n/a",
              gender: "n/a",
              age: "n/a",
              location: "Denver",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            keepMe: true,
          },
        },
      ]),
      updateTask,
    } as const;

    const profile = await updateLifeOpsOwnerProfile(runtime as never, {
      location: "New York",
      age: "34",
    });

    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("Shaw");
    expect(profile?.relationshipStatus).toBe("single");
    expect(profile?.age).toBe("34");
    expect(profile?.location).toBe("New York");
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          keepMe: true,
          lifeopsScheduler: { kind: "runtime_runner", version: 1 },
          ownerProfile: expect.objectContaining({
            name: "Shaw",
            relationshipStatus: "single",
            age: "34",
            location: "New York",
          }),
        }),
      }),
    );
  });
});
