import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { AliceCorpusConfig } from "./config.js";

export interface AliceCorpusManifest {
  schema_version: string;
  corpus_id: string;
  version: string;
  projections: Record<string, AliceCorpusProjectionManifest>;
  [key: string]: unknown;
}

export interface AliceCorpusProjectionManifest {
  projection: string;
  allowed_visibilities: string[];
  record_count: number;
  source_count?: number;
  graph_node_count: number;
  graph_edge_count: number;
  [key: string]: unknown;
}

export interface AliceCorpusRecord {
  record_id: string;
  record_type: string;
  title: string;
  statement: string;
  subject_id: string;
  visibility: string;
  [key: string]: unknown;
}

export interface AliceCorpusGraphNode {
  node_id: string;
  node_type: string;
  label: string;
  visibility: string;
  properties: Record<string, unknown>;
}

export interface AliceCorpusGraphEdge {
  edge_id: string;
  source: string;
  target: string;
  edge_type: string;
  visibility: string;
  properties: Record<string, unknown>;
}

export interface AliceCorpusDossier {
  relativePath: string;
  absolutePath: string;
  text: string;
}

export interface ValidatedAliceCorpus {
  config: AliceCorpusConfig;
  manifest: AliceCorpusManifest;
  projectionManifest: AliceCorpusProjectionManifest;
  records: AliceCorpusRecord[];
  dossiers: AliceCorpusDossier[];
  graphNodes: AliceCorpusGraphNode[];
  graphEdges: AliceCorpusGraphEdge[];
  inputDigest: string;
  verifiedFiles: ReadonlyMap<string, string>;
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function validateRecord(value: unknown, label: string): AliceCorpusRecord {
  assertObject(value, label);
  for (const field of [
    "record_id",
    "record_type",
    "title",
    "statement",
    "subject_id",
    "visibility",
  ] as const) {
    assertNonEmptyString(value[field], `${label} record ${field}`);
  }
  return value as AliceCorpusRecord;
}

function validateGraphNode(
  value: unknown,
  label: string,
): AliceCorpusGraphNode {
  assertObject(value, label);
  for (const field of [
    "node_id",
    "node_type",
    "label",
    "visibility",
  ] as const) {
    assertNonEmptyString(value[field], `${label} graph node ${field}`);
  }
  assertObject(value.properties, `${label} graph node properties`);
  return value as AliceCorpusGraphNode;
}

function validateGraphEdge(
  value: unknown,
  label: string,
): AliceCorpusGraphEdge {
  assertObject(value, label);
  for (const field of [
    "edge_id",
    "source",
    "target",
    "edge_type",
    "visibility",
  ] as const) {
    assertNonEmptyString(value[field], `${label} graph edge ${field}`);
  }
  assertObject(value.properties, `${label} graph edge properties`);
  return value as AliceCorpusGraphEdge;
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Malformed ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertObject(parsed, label);
  return parsed as T;
}

function parseJsonLines<T>(
  text: string,
  label: string,
  validate: (value: unknown, rowLabel: string) => T,
): T[] {
  const rows: T[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const rowLabel = `${label} line ${index + 1}`;
    try {
      rows.push(validate(JSON.parse(raw), rowLabel));
    } catch (error) {
      throw new Error(
        `Malformed ${rowLabel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return rows;
}

function assertUnique<T extends object>(
  rows: readonly T[],
  key: keyof T,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row[key] ?? "");
    if (!id) throw new Error(`${label} contains an empty ${String(key)}`);
    if (seen.has(id)) {
      throw new Error(`${label} contains duplicate ${String(key)}: ${id}`);
    }
    seen.add(id);
  }
}

function parseChecksumManifest(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(raw);
    if (!match) {
      throw new Error(`Malformed SHA256SUMS.txt line ${index + 1}`);
    }
    if (result.has(match[2])) {
      throw new Error(`Duplicate checksum path: ${match[2]}`);
    }
    result.set(match[2], match[1]);
  }
  return result;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function assertContainedFile(
  rootReal: string,
  candidate: string,
): Promise<string> {
  const candidateReal = await realpath(candidate);
  const relative = path.relative(rootReal, candidateReal);
  const contained =
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative));
  if (!contained) {
    throw new Error(
      `Corpus path traversal outside ALICE_CORPUS_ROOT: ${candidate}`,
    );
  }
  const info = await stat(candidateReal);
  if (!info.isFile()) throw new Error(`Expected file: ${candidate}`);
  return candidateReal;
}

async function listDossiers(directory: string): Promise<string[]> {
  const rows: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Corpus dossier symlinks are not allowed: ${absolute}`);
    }
    if (entry.isDirectory()) {
      rows.push(...(await listDossiers(absolute)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      rows.push(absolute);
    }
  }
  return rows.sort();
}

function validateManifestShapes(
  manifest: AliceCorpusManifest,
  projection: AliceCorpusProjectionManifest,
  expectedProjection: string,
): void {
  if (!manifest.schema_version || !manifest.corpus_id || !manifest.version) {
    throw new Error("CORPUS_MANIFEST.json is missing required identity fields");
  }
  if (!manifest.projections || typeof manifest.projections !== "object") {
    throw new Error("CORPUS_MANIFEST.json is missing projections");
  }
  if (projection.projection !== expectedProjection) {
    throw new Error(
      `Projection manifest name mismatch: expected ${expectedProjection}, got ${projection.projection}`,
    );
  }
  if (
    !Array.isArray(projection.allowed_visibilities) ||
    projection.allowed_visibilities.length === 0
  ) {
    throw new Error("Projection manifest is missing allowed_visibilities");
  }
  for (const field of [
    "record_count",
    "graph_node_count",
    "graph_edge_count",
  ] as const) {
    if (!Number.isInteger(projection[field]) || projection[field] < 0) {
      throw new Error(`Projection manifest has invalid ${field}`);
    }
  }
}

function assertProjectionManifestsAgree(
  topLevel: AliceCorpusProjectionManifest,
  selected: AliceCorpusProjectionManifest,
): void {
  for (const field of [
    "projection",
    "record_count",
    "graph_node_count",
    "graph_edge_count",
  ] as const) {
    if (topLevel[field] !== selected[field]) {
      throw new Error(
        `Projection manifests disagree on ${field}: ${String(topLevel[field])} != ${String(selected[field])}`,
      );
    }
  }
  if (
    JSON.stringify(topLevel.allowed_visibilities) !==
    JSON.stringify(selected.allowed_visibilities)
  ) {
    throw new Error("Projection manifests disagree on allowed_visibilities");
  }
}

function relativeCorpusPath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

export async function loadAndValidateCorpus(
  config: AliceCorpusConfig,
): Promise<ValidatedAliceCorpus> {
  const rootReal = await realpath(config.rootDir);
  const projectionRoot = path.join(rootReal, "projections", config.projection);
  const requiredPaths = {
    manifest: path.join(rootReal, "CORPUS_MANIFEST.json"),
    checksums: path.join(rootReal, "SHA256SUMS.txt"),
    projectionManifest: path.join(projectionRoot, "MANIFEST.json"),
    records: path.join(projectionRoot, "records.jsonl"),
    graphNodes: path.join(projectionRoot, "graph-nodes.jsonl"),
    graphEdges: path.join(projectionRoot, "graph-edges.jsonl"),
    dossiers: path.join(projectionRoot, "dossiers"),
  };

  const manifestPath = await assertContainedFile(
    rootReal,
    requiredPaths.manifest,
  );
  const projectionManifestPath = await assertContainedFile(
    rootReal,
    requiredPaths.projectionManifest,
  );
  const recordsPath = await assertContainedFile(
    rootReal,
    requiredPaths.records,
  );
  const graphNodesPath = await assertContainedFile(
    rootReal,
    requiredPaths.graphNodes,
  );
  const graphEdgesPath = await assertContainedFile(
    rootReal,
    requiredPaths.graphEdges,
  );
  const checksumsPath = await assertContainedFile(
    rootReal,
    requiredPaths.checksums,
  );

  const manifest = await readJson<AliceCorpusManifest>(
    manifestPath,
    "CORPUS_MANIFEST.json",
  );
  const projectionManifest = await readJson<AliceCorpusProjectionManifest>(
    projectionManifestPath,
    "projection MANIFEST.json",
  );
  validateManifestShapes(manifest, projectionManifest, config.projection);

  const declaredProjection = manifest.projections[config.projection];
  if (!declaredProjection) {
    throw new Error(
      `CORPUS_MANIFEST.json does not declare projection ${config.projection}`,
    );
  }
  assertProjectionManifestsAgree(declaredProjection, projectionManifest);

  const dossierPaths = await listDossiers(requiredPaths.dossiers);
  const selectedPaths = [
    manifestPath,
    projectionManifestPath,
    recordsPath,
    graphNodesPath,
    graphEdgesPath,
    ...dossierPaths,
  ];
  const selectedRelativePaths = new Set(
    selectedPaths.map((absolute) => relativeCorpusPath(rootReal, absolute)),
  );
  const checksumMap = parseChecksumManifest(
    await readFile(checksumsPath, "utf8"),
  );
  const verifiedFiles = new Map<string, string>();

  const verificationCandidates = new Set<string>();
  if (config.verifyMode === "selected" || config.verifyMode === "full") {
    for (const absolute of selectedPaths) verificationCandidates.add(absolute);
  }
  if (config.verifyMode === "full") {
    for (const relative of checksumMap.keys()) {
      verificationCandidates.add(path.join(rootReal, relative));
    }
  }

  for (const candidate of verificationCandidates) {
    const absolute = await assertContainedFile(rootReal, candidate);
    const relative = relativeCorpusPath(rootReal, absolute);
    const expected = checksumMap.get(relative);
    if (!expected) {
      if (selectedRelativePaths.has(relative) || config.strict) {
        throw new Error(
          `Missing checksum entry for selected corpus file: ${relative}`,
        );
      }
      continue;
    }
    const actual = await sha256File(absolute);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relative}`);
    }
    verifiedFiles.set(relative, actual);
  }

  const records = parseJsonLines(
    await readFile(recordsPath, "utf8"),
    "records.jsonl",
    validateRecord,
  );
  const graphNodes = parseJsonLines(
    await readFile(graphNodesPath, "utf8"),
    "graph-nodes.jsonl",
    validateGraphNode,
  );
  const graphEdges = parseJsonLines(
    await readFile(graphEdgesPath, "utf8"),
    "graph-edges.jsonl",
    validateGraphEdge,
  );
  assertUnique(records, "record_id", "records.jsonl");
  assertUnique(graphNodes, "node_id", "graph-nodes.jsonl");
  assertUnique(graphEdges, "edge_id", "graph-edges.jsonl");

  if (records.length !== projectionManifest.record_count) {
    throw new Error(
      `Projection record count mismatch: declared ${projectionManifest.record_count}, found ${records.length}`,
    );
  }
  if (graphNodes.length !== projectionManifest.graph_node_count) {
    throw new Error(
      `Projection graph node count mismatch: declared ${projectionManifest.graph_node_count}, found ${graphNodes.length}`,
    );
  }
  if (graphEdges.length !== projectionManifest.graph_edge_count) {
    throw new Error(
      `Projection graph edge count mismatch: declared ${projectionManifest.graph_edge_count}, found ${graphEdges.length}`,
    );
  }

  const allowedVisibilities = new Set(projectionManifest.allowed_visibilities);
  for (const record of records) {
    if (!allowedVisibilities.has(record.visibility)) {
      throw new Error(
        `Record ${record.record_id} has visibility ${record.visibility} outside projection ${config.projection}`,
      );
    }
  }
  for (const node of graphNodes) {
    if (!allowedVisibilities.has(node.visibility)) {
      throw new Error(
        `Graph node ${node.node_id} has visibility ${node.visibility} outside projection ${config.projection}`,
      );
    }
  }
  for (const edge of graphEdges) {
    if (!allowedVisibilities.has(edge.visibility)) {
      throw new Error(
        `Graph edge ${edge.edge_id} has visibility ${edge.visibility} outside projection ${config.projection}`,
      );
    }
  }

  const nodeIds = new Set(graphNodes.map((node) => node.node_id));
  for (const edge of graphEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(
        `Graph edge ${edge.edge_id} references missing endpoint: ${edge.source} -> ${edge.target}`,
      );
    }
  }

  const dossiers: AliceCorpusDossier[] = [];
  for (const absolutePath of dossierPaths) {
    const contained = await assertContainedFile(rootReal, absolutePath);
    dossiers.push({
      relativePath: relativeCorpusPath(rootReal, contained),
      absolutePath: contained,
      text: await readFile(contained, "utf8"),
    });
  }

  const inputHash = createHash("sha256");
  const digestRows = [...verifiedFiles.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (digestRows.length > 0) {
    for (const [relative, fileSha] of digestRows) {
      inputHash.update(`${relative}\0${fileSha}\n`);
    }
  } else {
    for (const absolute of selectedPaths) {
      const contained = await assertContainedFile(rootReal, absolute);
      const relative = relativeCorpusPath(rootReal, contained);
      inputHash.update(`${relative}\0${await sha256File(contained)}\n`);
    }
  }

  return {
    config,
    manifest,
    projectionManifest,
    records,
    dossiers,
    graphNodes,
    graphEdges,
    inputDigest: inputHash.digest("hex"),
    verifiedFiles,
  };
}
