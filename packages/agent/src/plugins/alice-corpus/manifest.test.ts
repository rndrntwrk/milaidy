import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAliceCorpusConfig } from "./config.js";
import { loadAndValidateCorpus } from "./manifest.js";
import {
  createCorpusFixture,
  rewriteCorpusFixtureChecksums,
} from "./test-fixtures.js";

describe("loadAndValidateCorpus", () => {
  it("validates a physical projection and reports deterministic counts", async () => {
    const { root } = await createCorpusFixture();
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    const corpus = await loadAndValidateCorpus(config!);

    expect(corpus.manifest.version).toBe("1.0.0");
    expect(corpus.records).toHaveLength(1);
    expect(corpus.dossiers).toHaveLength(1);
    expect(corpus.graphNodes).toHaveLength(2);
    expect(corpus.graphEdges).toHaveLength(1);
    expect(corpus.inputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a graph edge whose endpoint is absent", async () => {
    const { root } = await createCorpusFixture({ badEdge: true });
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(
      /missing endpoint/i,
    );
  });

  it("rejects a record outside the selected visibility projection", async () => {
    const { root } = await createCorpusFixture({ badVisibility: true });
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(/visibility/i);
  });

  it("rejects a declared record-count mismatch", async () => {
    const { root } = await createCorpusFixture({ declaredRecordCount: 2 });
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(
      /record count/i,
    );
  });

  it("rejects a selected input whose checksum changed", async () => {
    const { root } = await createCorpusFixture();
    await writeFile(
      path.join(root, "projections/internal/dossiers/system-test.md"),
      "tampered",
    );
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(/checksum/i);
  });

  it("rejects full verification when a required selected input is omitted from the checksum manifest", async () => {
    const { root } = await createCorpusFixture();
    const checksumPath = path.join(root, "SHA256SUMS.txt");
    const checksums = (await readFile(checksumPath, "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.includes("dossiers/system-test.md"));
    await writeFile(checksumPath, `${checksums.join("\n")}\n`);
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
      ALICE_CORPUS_VERIFY: "full",
      ALICE_CORPUS_STRICT: "0",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(
      /missing checksum.*dossiers\/system-test\.md/i,
    );
  });

  it("rejects malformed record rows before they can enter retrieval", async () => {
    const { root, files } = await createCorpusFixture();
    await writeFile(
      path.join(root, "projections/internal/records.jsonl"),
      `${JSON.stringify({
        record_id: "fact:test",
        record_type: "FACT",
        statement: "The test fact is true.",
        subject_id: "system:test",
        visibility: "INTERNAL",
      })}\n`,
    );
    await rewriteCorpusFixtureChecksums(root, files);
    const config = resolveAliceCorpusConfig({
      ALICE_CORPUS_ROOT: root,
      ALICE_CORPUS_PROJECTION: "internal",
    });

    await expect(loadAndValidateCorpus(config!)).rejects.toThrow(
      /record.*title/i,
    );
  });
});
