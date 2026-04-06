import {
  AgentSkillsService,
  MemorySkillStore,
} from "@elizaos/plugin-agent-skills";
import { afterEach, describe, expect, it, vi } from "vitest";

function createRuntime() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    runtime: {
      getSetting() {
        return undefined;
      },
      logger,
    },
    logger,
  };
}

describe("plugin-agent-skills catalog fetch patch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("coalesces concurrent 429 catalog fetches and respects cooldown", async () => {
    const { runtime, logger } = createRuntime();
    const service = new AgentSkillsService(runtime, {
      storage: new MemorySkillStore(),
      autoLoad: false,
      registryUrl: "https://skills.example",
    });

    const fetchMock = vi.fn(async () => {
      return new Response("rate limited", {
        status: 429,
        headers: {
          "retry-after": "120",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await service.getCatalog({ forceRefresh: true });

    expect(first).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "AgentSkills: Catalog fetch failed (will retry after cooldown): Error: Catalog fetch failed: 429",
      ),
    );
    expect(logger.info).not.toHaveBeenCalled();

    // Second call within cooldown should not trigger another fetch
    await expect(service.getCatalog({ forceRefresh: true })).resolves.toEqual(
      [],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
