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
    vi.restoreAllMocks();
  });

  it("coalesces concurrent 429 catalog fetches and respects cooldown", async () => {
    const { runtime, logger } = createRuntime();
    const service = new AgentSkillsService(runtime, {
      storage: new MemorySkillStore(),
      autoLoad: false,
      registryUrl: "https://skills.example",
    });

    const fetchMock = vi.fn(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: {
            "retry-after": "120",
          },
        }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    try {
      const first = await service.getCatalog({ forceRefresh: true });

      expect(first).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The local submodule logs to info with a specific 429 message;
      // the published npm version logs to warn with a generic error message.
      // Either way exactly one log call should have been made.
      const totalLogCalls1 =
        logger.info.mock.calls.length + logger.warn.mock.calls.length;
      expect(totalLogCalls1).toBe(1);

      // Second call within cooldown should not trigger another fetch
      await expect(service.getCatalog({ forceRefresh: true })).resolves.toEqual(
        [],
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // No additional logging on the second call (cooldown hit silently)
      const totalLogCalls2 =
        logger.info.mock.calls.length + logger.warn.mock.calls.length;
      expect(totalLogCalls2).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
