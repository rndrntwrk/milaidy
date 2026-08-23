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
  it("purges previously persisted corpus knowledge when no corpus root is configured", async () => {
    clearAliceCorpusRuntimeState();
    const { runtime, memories } = createRuntimeHarness();
    memories.set("corpus-document", {
      id: "corpus-document",
      tableName: "documents",
      metadata: {
        source: "alice-corpus",
        corpusProjection: "internal",
      },
    });
    memories.set("corpus-fragment", {
      id: "corpus-fragment",
      tableName: "knowledge",
      metadata: { documentId: "corpus-document" },
    });
    memories.set("unrelated-document", {
      id: "unrelated-document",
      tableName: "documents",
      metadata: { source: "other" },
    });
    const logs: Array<[string, Record<string, unknown>]> = [];

    await expect(
      initializeAliceCorpusRuntime(
        runtime as any,
        {},
        {
          seed: async () => undefined,
          documentIdForKey: () => "unused",
          log: (event, payload) => logs.push([event, payload]),
        },
      ),
    ).resolves.toBeNull();

    expect(memories.has("corpus-document")).toBe(false);
    expect(memories.has("corpus-fragment")).toBe(false);
    expect(memories.has("unrelated-document")).toBe(true);
    expect(logs[0]?.[0]).toBe("alice-corpus-purged");
    expect(getAliceCorpusRuntimeState("agent")).toBeNull();
  });

  it("seeds knowledge, builds the projected graph and stores only compact runtime identity", async () => {
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

    expect(state?.identity.version).toBe("1.0.0");
    expect(state?.identity.projection).toBe("internal");
    expect(state?.identity.recordCount).toBe(1);
    expect(state?.graph?.getNode("system:test")?.label).toBe("Test system");
    expect(state && "corpus" in state).toBe(false);
    expect(getAliceCorpusRuntimeState("agent")).toBe(state);
    expect(logs[0]?.[0]).toBe("alice-corpus-ready");
    expect(JSON.stringify(logs)).not.toContain("The test fact is true");
  });
});
