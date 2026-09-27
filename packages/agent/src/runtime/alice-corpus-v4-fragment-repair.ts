import { createHash } from "node:crypto";
import {
  type AgentRuntime,
  type Memory,
  MemoryType,
  ModelType,
  splitChunks,
  stringToUuid,
  type UUID,
} from "@elizaos/core";

const FRAGMENT_TABLE = "document_fragments";
const EMBEDDING_DIMENSIONS = 1024;
const MISSING_POSITION = 1;

type RepairSpec = Readonly<{
  parentId: UUID;
  parentSha256: string;
  fragmentSha256: readonly [string, string, string, string];
}>;

const ALICE_CORPUS_V4_DOCUMENT_10: RepairSpec = {
  parentId: "ab7b672a-c9ae-56e7-9866-8d9346b748b4" as UUID,
  parentSha256:
    "c536b416becb491f14cfdc710e9a7bccb1a69dd58eabc817489f9a76b5054ae7",
  fragmentSha256: [
    "067f73a0d082e8ebf41c8332a40a965649515ca7e506820b535016879550a350",
    "75b2abfd0b67b668d6716a4c4b3a93eb418d354994926970b7a4f7f6083a6725",
    "11053d25677e91feafda67a8c6385396340e2f4d4d02378c90433a3608b55a2d",
    "d1f3476f957cd13f1a884803d30eeacb6a50cd0e88e8f0abd5d9734f478c75da",
  ],
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function fail(): never {
  throw new Error("ALICE_CORPUS_V4_FRAGMENT_REPAIR_INVALID");
}

function hasFiniteEmbedding(memory: Memory): boolean {
  return (
    Array.isArray(memory.embedding) &&
    memory.embedding.length === EMBEDDING_DIMENSIONS &&
    memory.embedding.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  );
}

function comparableMetadata(memory: Memory): string {
  const metadata = memory.metadata as Record<string, unknown> | undefined;
  if (!metadata) fail();
  const { position: _position, timestamp: _timestamp, ...shared } = metadata;
  return JSON.stringify(shared);
}

async function readDocumentFragments(
  runtime: AgentRuntime,
  parent: Memory,
): Promise<Memory[]> {
  if (!parent.roomId) fail();
  // Five rows suffice to reject duplicates or extras for this four-fragment document.
  return runtime.getMemories({
    tableName: FRAGMENT_TABLE,
    roomId: parent.roomId,
    metadata: { documentId: parent.id },
    count: 5,
    includeEmbedding: true,
  });
}

function verifyFragments(
  runtime: AgentRuntime,
  parent: Memory,
  fragments: Memory[],
  spec: RepairSpec,
): Map<number, Memory> {
  if (fragments.length > spec.fragmentSha256.length) fail();
  const byPosition = new Map<number, Memory>();
  let sharedMetadata: string | undefined;
  for (const fragment of fragments) {
    const metadata = fragment.metadata as Record<string, unknown> | undefined;
    const position = metadata?.position;
    if (
      !Number.isInteger(position) ||
      typeof position !== "number" ||
      position < 0 ||
      position >= spec.fragmentSha256.length ||
      byPosition.has(position) ||
      metadata?.type !== MemoryType.FRAGMENT ||
      metadata?.documentId !== spec.parentId ||
      fragment.agentId !== runtime.agentId ||
      fragment.roomId !== parent.roomId ||
      fragment.worldId !== parent.worldId ||
      fragment.entityId !== parent.entityId ||
      typeof fragment.content.text !== "string" ||
      sha256(fragment.content.text) !== spec.fragmentSha256[position] ||
      !hasFiniteEmbedding(fragment)
    )
      fail();
    const comparable = comparableMetadata(fragment);
    if (sharedMetadata !== undefined && comparable !== sharedMetadata) fail();
    sharedMetadata = comparable;
    byPosition.set(position, fragment);
  }
  return byPosition;
}

/** Synthetic-corpus tests use the same checks without storing Alice's private text. */
export async function repairAliceCorpusFragment(
  runtime: AgentRuntime,
  spec: RepairSpec,
): Promise<"absent" | "complete" | "repaired"> {
  const parent = await runtime.getMemoryById(spec.parentId);
  if (!parent) return "absent";
  const text = parent.content.text;
  const parentMetadata = parent.metadata as Record<string, unknown> | undefined;
  if (
    parent.agentId !== runtime.agentId ||
    !parent.roomId ||
    !parent.entityId ||
    !parent.worldId ||
    parentMetadata?.type !== MemoryType.DOCUMENT ||
    parentMetadata?.documentId !== spec.parentId ||
    parentMetadata?.content_sha256 !== spec.parentSha256 ||
    typeof text !== "string" ||
    sha256(text) !== spec.parentSha256
  )
    fail();

  const chunks = await splitChunks(text, 500, 100);
  if (
    chunks.length !== spec.fragmentSha256.length ||
    chunks.some(
      (chunk, position) => sha256(chunk) !== spec.fragmentSha256[position],
    )
  )
    fail();

  const byPosition = verifyFragments(
    runtime,
    parent,
    await readDocumentFragments(runtime, parent),
    spec,
  );
  if (byPosition.size === spec.fragmentSha256.length) return "complete";
  if (
    byPosition.size !== spec.fragmentSha256.length - 1 ||
    byPosition.has(MISSING_POSITION) ||
    !byPosition.has(0) ||
    !byPosition.has(2) ||
    !byPosition.has(3)
  )
    fail();

  const reference = byPosition.get(0);
  const missingChunk = chunks[MISSING_POSITION];
  if (!reference || missingChunk === undefined) fail();
  const id = stringToUuid(
    `alice-corpus-v4:${spec.parentId}:fragment:${MISSING_POSITION}`,
  );
  if (await runtime.getMemoryById(id)) fail();
  if (!runtime.getModel(ModelType.TEXT_EMBEDDING)) fail();

  const now = Date.now();
  const memory: Memory = {
    id,
    agentId: parent.agentId,
    roomId: parent.roomId,
    worldId: parent.worldId,
    entityId: parent.entityId,
    content: { text: missingChunk },
    metadata: {
      ...reference.metadata,
      type: MemoryType.FRAGMENT,
      documentId: spec.parentId,
      position: MISSING_POSITION,
      timestamp: now,
    },
    createdAt: now,
    unique: true,
  };
  const embedded = await runtime.addEmbeddingToMemory(memory);
  if (
    !hasFiniteEmbedding(embedded) ||
    embedded.content.text !== missingChunk ||
    runtime.getLastResolvedModelProvider(ModelType.TEXT_EMBEDDING) !== "openai"
  )
    fail();

  const writtenId = await runtime.createMemory(embedded, FRAGMENT_TABLE, true);
  if (writtenId !== id) fail();
  const repaired = verifyFragments(
    runtime,
    parent,
    await readDocumentFragments(runtime, parent),
    spec,
  );
  if (
    repaired.size !== spec.fragmentSha256.length ||
    repaired.get(MISSING_POSITION)?.id !== id
  ) {
    fail();
  }
  return "repaired";
}

export async function repairAliceCorpusV4Fragment(
  runtime: AgentRuntime,
): Promise<void> {
  await repairAliceCorpusFragment(runtime, ALICE_CORPUS_V4_DOCUMENT_10);
}
