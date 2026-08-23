import { describe, expect, it } from "vitest";
import type { AliceCorpusProjection } from "./config.js";
import {
  type AliceCorpusKnowledgeDocumentDefinition,
  type AliceCorpusMemoryRuntime,
  type AliceCorpusStoredMemory,
  buildAliceCorpusKnowledgeDocuments,
  seedAliceCorpusKnowledge,
} from "./knowledge.js";

type KnowledgeCorpus = Parameters<
  typeof buildAliceCorpusKnowledgeDocuments
>[0];

interface TestMemory extends AliceCorpusStoredMemory {
  id: string;
  tableName: "documents" | "knowledge";
  content?: { text: string };
}

function fixtureCorpus(
  projection: AliceCorpusProjection = "internal",
): KnowledgeCorpus {
  return {
    config: {
      rootDir: "/tmp/alice-corpus",
      projection,
      verifyMode: "selected",
      strict: true,
      graphEnabled: true,
      allowOwnerPrivate: false,
    },
    manifest: {
      schema_version: "1.0",
      corpus_id: "test-corpus",
      version: "1.2.3",
      projections: {},
    },
    inputDigest: "a".repeat(64),
    dossiers: [
      {
        relativePath: `projections/${projection}/dossiers/system-test.md`,
        absolutePath: `/tmp/alice-corpus/projections/${projection}/dossiers/system-test.md`,
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
  };
}

describe("Alice corpus knowledge", () => {
  it("builds stable dossier and record-group documents without leaking logical paths through filenames", () => {
    const documents = buildAliceCorpusKnowledgeDocuments(fixtureCorpus());
    const dossier = documents.find(
      (document) => document.metadata?.corpusDocumentKind === "dossier",
    );
    const records = documents.find(
      (document) => document.metadata?.corpusDocumentKind === "record-group",
    );

    expect(documents).toHaveLength(2);
    expect(dossier?.key).toMatch(/alice-corpus:1\.2\.3:internal:dossier:/);
    expect(dossier?.filename).toMatch(/^alice-corpus-[a-f0-9]{24}\.md$/);
    expect(dossier?.filename).not.toContain("system-test");
    expect(dossier?.metadata?.corpusLogicalPath).toBe(
      "projections/internal/dossiers/system-test.md",
    );
    expect(dossier?.fragments.length).toBeGreaterThanOrEqual(2);
    expect(records?.fragments).toHaveLength(1);
    expect(records?.fragments[0]?.text).toContain("record_id: fact:test");
    expect(records?.fragments[0]?.text).toContain("source_refs: src:test");
    expect(records?.fragments[0]?.text).toContain("Boundary: Not production.");
  });

  it("is idempotent and physically removes the previous projection", async () => {
    const memories = new Map<string, TestMemory>();
    const runtime: AliceCorpusMemoryRuntime = {
      agentId: "agent",
      async getMemories({ tableName, start = 0, count = 100 }) {
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
    const seed = async (
      _runtime: unknown,
      documents: readonly AliceCorpusKnowledgeDocumentDefinition[],
    ) => {
      for (const document of documents) {
        const documentId = documentIdForKey("agent", document.key);
        memories.set(documentId, {
          id: documentId,
          tableName: "documents",
          metadata: { ...document.metadata, documentId },
        });
        document.fragments.forEach((fragment, index) => {
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
      runtime,
      fixtureCorpus("internal"),
      { seed, documentIdForKey },
    );
    const sizeAfterFirst = memories.size;
    const second = await seedAliceCorpusKnowledge(
      runtime,
      fixtureCorpus("internal"),
      { seed, documentIdForKey },
    );

    expect(first.prunedDocuments).toBe(0);
    expect(second.prunedDocuments).toBe(0);
    expect(memories.size).toBe(sizeAfterFirst);

    const switched = await seedAliceCorpusKnowledge(
      runtime,
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
