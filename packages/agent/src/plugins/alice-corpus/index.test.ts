import { afterEach, describe, expect, it, vi } from "vitest";
import { createAliceCorpusPlugin } from "./index.js";

type AliceCorpusPluginInit = NonNullable<
  ReturnType<typeof createAliceCorpusPlugin>["init"]
>;
type AliceCorpusPluginRuntime = Parameters<AliceCorpusPluginInit>[1];

interface TestMemory {
  id: string;
  tableName: "documents" | "knowledge";
  metadata: Record<string, string>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Alice corpus plugin lifecycle", () => {
  it("runs no-root cleanup instead of returning before persisted corpus is purged", async () => {
    vi.stubEnv("ALICE_CORPUS_ROOT", "");
    const memories = new Map<string, TestMemory>([
      [
        "corpus-document",
        {
          id: "corpus-document",
          tableName: "documents",
          metadata: { source: "alice-corpus" },
        },
      ],
      [
        "corpus-fragment",
        {
          id: "corpus-fragment",
          tableName: "knowledge",
          metadata: { documentId: "corpus-document" },
        },
      ],
    ]);
    const runtime = {
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
    };

    await createAliceCorpusPlugin().init?.(
      {},
      runtime as unknown as AliceCorpusPluginRuntime,
    );

    expect(memories.size).toBe(0);
  });
});
