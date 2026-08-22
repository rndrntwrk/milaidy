import { describe, expect, it } from "vitest";
import {
  buildAliceCorpusKnowledgeDocuments,
  seedAliceCorpusKnowledge,
} from "./knowledge.js";

function fixtureCorpus(projection = "internal") {
  return {
    config: { projection },
    manifest: { corpus_id: "test-corpus", version: "1.2.3" },
    inputDigest: "a".repeat(64),
    dossiers: [
      {
        relativePath: `projections/${projection}/dossiers/system-test.md`,
        text: "# Test system\n\n## Purpose\n\nBody.\n\n## Boundary\n\nNot production.\n",
      },
    ],
    records: [
      {
        record_id: "fact:test",
        record_type: "FACT",
        title: "Test fact",
        statement: "The fact is true.",
        subject_id: "system:test",
        truth_class: "PRIMARY_SYSTEM_OBSERVATION",
        authority_class: "TEST",
        canonicality: "CURRENT",
        maturity: "TEST",
        as_of: "2026-08-22",
        claim_permission: "SUPPORTING",
        counterclaim_or_boundary: "Not production.",
        source_refs: ["src:test"],
        visibility: "INTERNAL",
      },
    ],
  } as any;
}

describe("Alice corpus knowledge", () => {
  it("builds stable dossier and record-group documents", () => {
    const documents = buildAliceCorpusKnowledgeDocuments(fixtureCorpus());
    const dossier = documents.find(
      (document) => document.metadata?.corpusDocumentKind === "dossier",
    );
    const records = documents.find(
      (document) => document.metadata?.corpusDocumentKind === "record-group",
    );

    expect(documents).toHaveLength(2);
    expect(dossier?.key).toMatch(
      /alice-corpus:1\.2\.3:internal:dossier:/,
    );
    expect(dossier?.fragments.length).toBeGreaterThanOrEqual(2);
    expect(records?.fragments).toHaveLength(1);
    expect(records?.fragments[0]?.text).toContain("record_id: fact:test");
    expect(records?.fragments[0]?.text).toContain("source_refs: src:test");
    expect(records?.fragments[0]?.text).toContain(
      "Boundary: Not production.",
    );
  });

  it("is idempotent and physically removes the previous projection", async () => {
    const memories = new Map<string, any>();
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
    const documentIdForKey = (agentId: string, key: string) =>
      `document:${agentId}:${key}`;
    const seed = async (_runtime: unknown, documents: readonly any[]) => {
      for (const document of documents) {
        const documentId = documentIdForKey("agent", document.key);
        memories.set(documentId, {
          id: documentId,
          tableName: "documents",
          metadata: { ...document.metadata, documentId },
        });
        document.fragments.forEach((fragment: any, index: number) => {
          memories.set(`${documentId}:fragment:${index}`, {
            id: `${documentId}:fragment:${index}`,
            tableName: "knowledge",
            metadata: { documentId },
            content: { text: fragment.text },
          });
        });
      }
    };

    const first = await seedAliceCorpusKnowledge(
      runtime as any,
      fixtureCorpus("internal"),
      { seed, documentIdForKey },
    );
    const sizeAfterFirst = memories.size;
    const second = await seedAliceCorpusKnowledge(
      runtime as any,
      fixtureCorpus("internal"),
      { seed, documentIdForKey },
    );

    expect(first.prunedDocuments).toBe(0);
    expect(second.prunedDocuments).toBe(0);
    expect(memories.size).toBe(sizeAfterFirst);

    const switched = await seedAliceCorpusKnowledge(
      runtime as any,
      fixtureCorpus("public"),
      { seed, documentIdForKey },
    );

    expect(switched.prunedDocuments).toBeGreaterThan(0);
    expect(
      [...memories.values()].every(
        (memory) => memory.metadata?.corpusProjection !== "internal",
      ),
    ).toBe(true);
    expect(
      [...memories.values()].some(
        (memory) => memory.metadata?.corpusProjection === "public",
      ),
    ).toBe(true);
  });
});
