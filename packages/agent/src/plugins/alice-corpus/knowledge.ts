import { createHash } from "node:crypto";
import type { ValidatedAliceCorpus } from "./manifest.js";

export interface AliceCorpusKnowledgeFragmentDefinition {
  text: string;
  embedding?: number[];
}

export interface AliceCorpusKnowledgeDocumentDefinition {
  key: string;
  version: number;
  filename: string;
  contentType: string;
  text: string;
  fragments: readonly AliceCorpusKnowledgeFragmentDefinition[];
  metadata?: Record<string, unknown>;
}

export interface AliceCorpusStoredMemory {
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface AliceCorpusMemoryRuntime {
  agentId: string;
  getMemories(options: {
    tableName: string;
    roomId?: string;
    count: number;
    start: number;
  }): Promise<AliceCorpusStoredMemory[]>;
  deleteMemory(id: string): Promise<void>;
}

export interface AliceCorpusKnowledgeDependencies {
  seed(
    runtime: unknown,
    documents: readonly AliceCorpusKnowledgeDocumentDefinition[],
  ): Promise<void>;
  documentIdForKey(agentId: string, key: string): string;
}

export interface AliceCorpusSeedReport {
  documentCount: number;
  fragmentCount: number;
  prunedDocuments: number;
  prunedFragments: number;
  corpusVersion: string;
  projection: string;
  inputDigest: string;
}

export interface AliceCorpusPurgeReport {
  prunedDocuments: number;
  prunedFragments: number;
}

const ALICE_CORPUS_SOURCE = "alice-corpus";
const MEMORY_PAGE_SIZE = 100;
const MAX_FRAGMENT_CHARACTERS = 5_000;

function corpusVersionNumber(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return major * 1_000_000 + minor * 1_000 + patch;
}

function stableSlug(value: string): string {
  const normalized = value
    .replaceAll("\\", "/")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/");
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${normalized.slice(0, 100)}:${digest}`;
}

function opaqueFilename(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `alice-corpus-${digest}.md`;
}

function splitMarkdown(text: string): string[] {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let heading = "";

  const flush = () => {
    const body = current.join("\n").trim();
    if (body) chunks.push(body);
    current = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      heading = line.trim();
      current = [heading];
      continue;
    }

    if (current.length === 0 && heading) current = [heading];
    const candidate = [...current, line].join("\n");
    if (candidate.length > MAX_FRAGMENT_CHARACTERS && current.length > 0) {
      flush();
      current = heading ? [heading, line] : [line];
    } else {
      current.push(line);
    }
  }
  flush();

  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}

function scalar(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(scalar).filter(Boolean).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatRecordFragment(record: Record<string, unknown>): string {
  const lines = [
    `# ${scalar(record.title) || scalar(record.record_id)}`,
    scalar(record.statement),
  ];
  const boundary = scalar(record.counterclaim_or_boundary);
  if (boundary) lines.push(`Boundary: ${boundary}`);

  for (const [label, key] of [
    ["record_id", "record_id"],
    ["subject_id", "subject_id"],
    ["truth_class", "truth_class"],
    ["authority_class", "authority_class"],
    ["canonicality", "canonicality"],
    ["maturity", "maturity"],
    ["as_of", "as_of"],
    ["claim_permission", "claim_permission"],
    ["source_refs", "source_refs"],
  ] as const) {
    const value = scalar(record[key]);
    if (value) lines.push(`${label}: ${value}`);
  }

  return lines.filter(Boolean).join("\n\n");
}

export function buildAliceCorpusKnowledgeDocuments(
  corpus: Pick<
    ValidatedAliceCorpus,
    "config" | "manifest" | "inputDigest" | "dossiers" | "records"
  >,
): AliceCorpusKnowledgeDocumentDefinition[] {
  const version = corpusVersionNumber(corpus.manifest.version);
  const commonMetadata = {
    source: ALICE_CORPUS_SOURCE,
    corpusId: corpus.manifest.corpus_id,
    corpusVersion: corpus.manifest.version,
    corpusProjection: corpus.config.projection,
    corpusInputDigest: corpus.inputDigest,
  };
  const documents: AliceCorpusKnowledgeDocumentDefinition[] = [];

  for (const dossier of [...corpus.dossiers].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )) {
    const key = `alice-corpus:${corpus.manifest.version}:${corpus.config.projection}:dossier:${stableSlug(dossier.relativePath)}`;
    const fragments = splitMarkdown(dossier.text).map((text) => ({ text }));
    documents.push({
      key,
      version,
      filename: opaqueFilename(key),
      contentType: "text/markdown",
      text: dossier.text,
      fragments,
      metadata: {
        ...commonMetadata,
        corpusDocumentKind: "dossier",
        corpusLogicalPath: dossier.relativePath,
      },
    });
  }

  const recordsByType = new Map<string, Record<string, unknown>[]>();
  for (const record of corpus.records) {
    const recordType = scalar(record.record_type) || "UNKNOWN";
    const rows = recordsByType.get(recordType) ?? [];
    rows.push(record);
    recordsByType.set(recordType, rows);
  }

  for (const [recordType, records] of [...recordsByType.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    records.sort((left, right) =>
      scalar(left.record_id).localeCompare(scalar(right.record_id)),
    );
    const fragments = records.map((record) => ({
      text: formatRecordFragment(record),
    }));
    const key = `alice-corpus:${corpus.manifest.version}:${corpus.config.projection}:records:${stableSlug(recordType)}`;
    documents.push({
      key,
      version,
      filename: opaqueFilename(key),
      contentType: "text/markdown",
      text: fragments.map((fragment) => fragment.text).join("\n\n---\n\n"),
      fragments,
      metadata: {
        ...commonMetadata,
        corpusDocumentKind: "record-group",
        corpusRecordType: recordType,
        corpusRecordCount: records.length,
      },
    });
  }

  return documents;
}

async function listAllMemories(
  runtime: AliceCorpusMemoryRuntime,
  tableName: string,
): Promise<AliceCorpusStoredMemory[]> {
  const rows: AliceCorpusStoredMemory[] = [];
  let start = 0;
  while (true) {
    const batch = await runtime.getMemories({
      tableName,
      roomId: runtime.agentId,
      count: MEMORY_PAGE_SIZE,
      start,
    });
    rows.push(...batch);
    if (batch.length < MEMORY_PAGE_SIZE) break;
    start += MEMORY_PAGE_SIZE;
  }
  return rows;
}

function isAliceCorpusDocument(memory: AliceCorpusStoredMemory): boolean {
  const metadata = memory.metadata;
  const key = metadata?.key ?? metadata?.bundledKnowledgeKey;
  return (
    metadata?.source === ALICE_CORPUS_SOURCE ||
    (typeof key === "string" && key.startsWith("alice-corpus:"))
  );
}

export async function purgeAliceCorpusKnowledge(
  runtime: AliceCorpusMemoryRuntime,
): Promise<AliceCorpusPurgeReport> {
  const documentIds = new Set<string>();
  for (const memory of await listAllMemories(runtime, "documents")) {
    if (isAliceCorpusDocument(memory) && typeof memory.id === "string") {
      documentIds.add(memory.id);
    }
  }

  let prunedFragments = 0;
  if (documentIds.size > 0) {
    for (const fragment of await listAllMemories(runtime, "knowledge")) {
      const documentId = fragment.metadata?.documentId;
      if (
        typeof fragment.id === "string" &&
        typeof documentId === "string" &&
        documentIds.has(documentId)
      ) {
        await runtime.deleteMemory(fragment.id);
        prunedFragments += 1;
      }
    }
  }

  for (const documentId of documentIds) {
    await runtime.deleteMemory(documentId);
  }

  return {
    prunedDocuments: documentIds.size,
    prunedFragments,
  };
}

export async function seedAliceCorpusKnowledge(
  runtime: AliceCorpusMemoryRuntime,
  corpus: Pick<
    ValidatedAliceCorpus,
    "config" | "manifest" | "inputDigest" | "dossiers" | "records"
  >,
  dependencies: AliceCorpusKnowledgeDependencies,
): Promise<AliceCorpusSeedReport> {
  const documents = buildAliceCorpusKnowledgeDocuments(corpus);
  await dependencies.seed(runtime, documents);

  const expectedDocumentIds = new Set(
    documents.map((document) =>
      dependencies.documentIdForKey(runtime.agentId, document.key),
    ),
  );
  const staleDocumentIds = new Set<string>();

  for (const memory of await listAllMemories(runtime, "documents")) {
    if (
      isAliceCorpusDocument(memory) &&
      typeof memory.id === "string" &&
      !expectedDocumentIds.has(memory.id)
    ) {
      staleDocumentIds.add(memory.id);
    }
  }

  let prunedFragments = 0;
  if (staleDocumentIds.size > 0) {
    for (const fragment of await listAllMemories(runtime, "knowledge")) {
      const documentId = fragment.metadata?.documentId;
      if (
        typeof fragment.id === "string" &&
        typeof documentId === "string" &&
        staleDocumentIds.has(documentId)
      ) {
        await runtime.deleteMemory(fragment.id);
        prunedFragments += 1;
      }
    }
  }

  for (const documentId of staleDocumentIds) {
    await runtime.deleteMemory(documentId);
  }

  return {
    documentCount: documents.length,
    fragmentCount: documents.reduce(
      (count, document) => count + document.fragments.length,
      0,
    ),
    prunedDocuments: staleDocumentIds.size,
    prunedFragments,
    corpusVersion: corpus.manifest.version,
    projection: corpus.config.projection,
    inputDigest: corpus.inputDigest,
  };
}
