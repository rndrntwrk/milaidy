import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface CorpusFixtureOptions {
  badEdge?: boolean;
  badVisibility?: boolean;
  declaredRecordCount?: number;
  projection?: string;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

export async function rewriteCorpusFixtureChecksums(
  root: string,
  relativePaths: readonly string[],
): Promise<void> {
  const lines: string[] = [];
  for (const relativePath of [...relativePaths].sort()) {
    lines.push(
      `${await sha256File(path.join(root, relativePath))}  ${relativePath}`,
    );
  }
  await writeFile(path.join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
}

export async function createCorpusFixture(
  options: CorpusFixtureOptions = {},
): Promise<{ root: string; files: string[] }> {
  const root = await mkdtemp(path.join(tmpdir(), "alice-corpus-"));
  const projection = options.projection ?? "internal";
  const projectionRoot = path.join(root, "projections", projection);
  await mkdir(path.join(projectionRoot, "dossiers"), { recursive: true });

  const record = {
    record_id: "fact:test",
    record_type: "FACT",
    title: "Test fact",
    statement: "The test fact is true.",
    subject_id: "system:test",
    truth_class: "PRIMARY_SYSTEM_OBSERVATION",
    authority_class: "TEST",
    canonicality: "CURRENT",
    maturity: "TEST",
    as_of: "2026-08-22",
    claim_permission: "SUPPORTING",
    counterclaim_or_boundary: "This fixture is not production evidence.",
    source_refs: ["src:test"],
    visibility: options.badVisibility ? "OWNER_PRIVATE" : "INTERNAL",
  };

  const declaredRecordCount = options.declaredRecordCount ?? 1;
  const files: Record<string, string> = {
    "CORPUS_MANIFEST.json": JSON.stringify({
      schema_version: "1.0",
      corpus_id: "test-corpus",
      version: "1.0.0",
      projections: {
        [projection]: {
          projection,
          allowed_visibilities: ["PUBLIC", "INTERNAL"],
          record_count: declaredRecordCount,
          graph_node_count: 2,
          graph_edge_count: 1,
        },
      },
    }),
    [`projections/${projection}/MANIFEST.json`]: JSON.stringify({
      projection,
      allowed_visibilities: ["PUBLIC", "INTERNAL"],
      record_count: declaredRecordCount,
      source_count: 0,
      graph_node_count: 2,
      graph_edge_count: 1,
    }),
    [`projections/${projection}/records.jsonl`]: `${JSON.stringify(record)}\n`,
    [`projections/${projection}/dossiers/system-test.md`]:
      "# Test system\n\n## Purpose\n\nFixture body.\n",
    [`projections/${projection}/graph-nodes.jsonl`]: `${JSON.stringify({
      node_id: "system:test",
      node_type: "System",
      label: "Test system",
      visibility: "INTERNAL",
      properties: { record_ids: ["fact:test"] },
    })}\n${JSON.stringify({
      node_id: "record:fact:test",
      node_type: "Record",
      label: "Test fact",
      visibility: "INTERNAL",
      properties: { record_ids: ["fact:test"] },
    })}\n`,
    [`projections/${projection}/graph-edges.jsonl`]: `${JSON.stringify({
      edge_id: "edge:1",
      source: "record:fact:test",
      target: options.badEdge ? "missing:node" : "system:test",
      edge_type: "ABOUT",
      visibility: "INTERNAL",
      properties: {},
    })}\n`,
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  const relativePaths = Object.keys(files);
  await rewriteCorpusFixtureChecksums(root, relativePaths);
  return { root, files: relativePaths };
}
