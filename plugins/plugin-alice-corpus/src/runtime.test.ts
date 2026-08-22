import { describe, expect, it } from "vitest";
import {
  clearAliceCorpusRuntimeState,
  getAliceCorpusRuntimeState,
  initializeAliceCorpusRuntime,
} from "./runtime.js";
import { createCorpusFixture } from "./test-fixtures.js";

function createRuntimeHarness() {
  const memories = new Map<string, any>();
  return {
    memories,
    runtime: {
      agentId: "agent",
      async getMemories({
        tableName,
        start = 0,
        count = 100,
      }: {
        tableName: string;
        start?: number;
        count?: number;
      }) {
        return [...memories.values()]
          .filter((memory) => memory.tableName === tableName)
          .slice(start, start + count);
      },
      async deleteMemory(id: string) {
        memories.delete(id);
      },
    },
  };
}

describe("initializeAliceCorpusRuntime", () => {
  it("is a clean no-op when no corpus root is configured", async () => {
    clearAliceCorpusRuntimeState();
    const { runtime } = createRuntimeHarness();

    await expect(
      initializeAliceCorpusRuntime(runtime as any, {}, {
        seed: async () => undefined,
        documentIdForKey: () => "unused",
      }),
    ).resolves.toBeNull();
  });

  it("seeds knowledge, builds the projected graph and stores runtime state", async () => {
    clearAliceCorpusRuntimeState();
    const { root } = await createCorpusFixture();
    const { runtime, memories } = createRuntimeHarness();
    const logs: Array<[string, Record<string, unknown>]> = [];
    const documentIdForKey = (agentId: string, key: string) =>
      `document:${agentId}:${key}`;

    const state = await initializeAliceCorpusRuntime(
      runtime as any,
      {
        ALICE_CORPUS_ROOT: root,
        ALICE_CORPUS_PROJECTION: "internal",
      },
      {
        documentIdForKey,
        seed: async (_runtime, documents) => {
          for (const document of documents) {
            const documentId = documentIdForKey("agent", document.key);
            memories.set(documentId, {
              id: documentId,
              tableName: "documents",
              metadata: { ...document.metadata, documentId },
            });
          }
        },
        log: (event, payload) => logs.push([event, payload]),
      },
    );

    expect(state?.corpus.manifest.version).toBe("1.0.0");
    expect(state?.graph?.getNode("system:test")?.label).toBe("Test system");
    expect(getAliceCorpusRuntimeState("agent")).toBe(state);
    expect(logs[0]?.[0]).toBe("alice-corpus-ready");
    expect(JSON.stringify(logs)).not.toContain("The test fact is true");
  });
});
