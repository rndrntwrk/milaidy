import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AliceCorpusConfig,
  resolveAliceCorpusConfig,
} from "./config.js";
import { loadAndValidateCorpus } from "./manifest.js";
import {
  createCorpusFixture,
  rewriteCorpusFixtureChecksums,
} from "./test-fixtures.js";

function fixtureConfig(
  root: string,
  overrides: NodeJS.ProcessEnv = {},
): AliceCorpusConfig {
  const config = resolveAliceCorpusConfig({
    ALICE_CORPUS_ROOT: root,
    ALICE_CORPUS_PROJECTION: "internal",
    ...overrides,
  });
  if (!config) {
    throw new Error("Expected the Alice corpus fixture to resolve a config");
  }
  return config;
}

describe("loadAndValidateCorpus", () => {
  it("validates a physical projection and reports deterministic counts", async () => {
    const { root } = await createCorpusFixture();
    const corpus = await loadAndValidateCorpus(fixtureConfig(root));

    expect(corpus.manifest.version).toBe("1.0.0");
    expect(corpus.records).toHaveLength(1);
    expect(corpus.dossiers).toHaveLength(1);
    expect(corpus.graphNodes).toHaveLength(2);
    expect(corpus.graphEdges).toHaveLength(1);
    expect(corpus.inputDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a graph edge whose endpoint is absent", async () => {
    const { root } = await createCorpusFixture({ badEdge: true });

    await expect(loadAndValidateCorpus(fixtureConfig(root))).rejects.toThrow(
      /missing endpoint/i,
    );
  });

  it("rejects a record outside the selected visibility projection", async () => {
    const { root } = await createCorpusFixture({ badVisibility: true });

    await expect(loadAndValidateCorpus(fixtureConfig(root))).rejects.toThrow(
      /visibility/i,
    );
  });

  it("rejects a declared record-count mismatch", async () => {
    const { root } = await createCorpusFixture({ declaredRecordCount: 2 });

    await expect(loadAndValidateCorpus(fixtureConfig(root))).rejects.toThrow(
      /record count/i,
    );
  });

  it("rejects a selected input whose checksum changed", async () => {
    const { root } = await createCorpusFixture();
    await writeFile(
      path.join(root, "projections/internal/dossiers/system-test.md"),
      "tampered",
    );

    await expect(loadAndValidateCorpus(fixtureConfig(root))).rejects.toThrow(
      /checksum/i,
    );
  });

  it("rejects full verification when a required selected input is omitted from the checksum manifest", async () => {
    const { root } = await createCorpusFixture();
    const checksumPath = path.join(root, "SHA256SUMS.txt");
    const checksums = (await readFile(checksumPath, "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.includes("dossiers/system-test.md"));
    await writeFile(checksumPath, `${checksums.join("\n")}\n`);

    await expect(
      loadAndValidateCorpus(
        fixtureConfig(root, {
          ALICE_CORPUS_VERIFY: "full",
          ALICE_CORPUS_STRICT: "0",
        }),
      ),
    ).rejects.toThrow(/missing checksum.*dossiers\/system-test\.md/i);
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

    await expect(loadAndValidateCorpus(fixtureConfig(root))).rejects.toThrow(
      /record.*title/i,
    );
  });
});
