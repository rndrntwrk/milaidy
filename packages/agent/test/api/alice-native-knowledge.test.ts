import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type AccessContext,
  AgentRuntime,
  ChannelType,
  DocumentService,
  documentsProvider,
  type Memory,
  ModelType,
  type State,
  splitChunks,
  type UUID,
} from "@elizaos/core";
import { handleKnowledgeRoutes } from "../../src/api/knowledge-routes";
import { getKnowledgeService } from "../../src/api/knowledge-service-loader";
import {
  type AliceElizaStateCommit,
  type AliceElizaStateRecord,
  createAliceD1DatabaseAdapter,
} from "../../src/runtime/alice-d1-database-adapter";
import { runtimeKnowledgeEnabled } from "../../src/runtime/native-runtime-features";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const AGENT = "00000000-0000-4000-8000-000000000001" as UUID;
const OWNER = "00000000-0000-4000-8000-000000000002" as UUID;
const GUEST = "00000000-0000-4000-8000-000000000003" as UUID;
const owner: AccessContext = {
  requesterEntityId: OWNER,
  role: "OWNER",
  isOwner: true,
};
const sourcePath = process.env.ALICE_TEST_CORPUS_PATH;
const documents: Array<{
  filename: string;
  content: string;
  contentType: string;
  metadata?: Record<string, unknown>;
}> = sourcePath
  ? JSON.parse(readFileSync(sourcePath, "utf8")).documents
  : [
      {
        filename: "settlement.md",
        contentType: "text/markdown",
        content:
          "SW4P coordinates settlement. The $555 destination is Pump.fun. A successful upload is distinct from verified retrieval.",
        metadata: { sourceId: "fixture-settlement" },
      },
    ];

// Match production embedding width and realistic JSON size without a paid model.
function embedding(text: string): number[] {
  let seed = createHash("sha256").update(text).digest().readUInt32BE(0);
  return Array.from({ length: 1024 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 0.1 + seed / 4294967296;
  });
}

class PersistedTransport {
  revision = 0;
  maxRecordBytes = 0;
  maxMutations = 0;
  records = new Map<string, AliceElizaStateRecord>();
  async load() {
    return {
      revision: this.revision,
      records: structuredClone([...this.records.values()]),
    };
  }
  async commit(input: AliceElizaStateCommit) {
    expect(input.expectedRevision).toBe(this.revision);
    this.maxMutations = Math.max(this.maxMutations, input.mutations.length);
    for (const mutation of input.mutations) {
      const key = mutation.collection + "\0" + mutation.key;
      if (mutation.deleted === true) this.records.delete(key);
      else {
        const record = {
          collection: mutation.collection,
          key: mutation.key,
          value: structuredClone(mutation.value),
        };
        this.maxRecordBytes = Math.max(
          this.maxRecordBytes,
          Buffer.byteLength(JSON.stringify(record)),
        );
        this.records.set(key, record);
      }
    }
    return { revision: ++this.revision };
  }
}

async function runtimeFor(transport: PersistedTransport) {
  const adapter = createAliceD1DatabaseAdapter({
    ownerId: "alice-owner-production",
    transport,
  });
  await adapter.initialize();
  const runtime = new AgentRuntime({
    adapter,
    disableBasicCapabilities: true,
    enableRelationships: false,
    enableTrajectories: false,
    character: {
      id: AGENT,
      name: "Alice",
      bio: ["Native knowledge test"],
      settings: {
        ELIZA_ADMIN_ENTITY_ID: OWNER,
        OPENAI_EMBEDDING_DIMENSIONS: "1024",
        LOAD_DOCS_ON_STARTUP: false,
        CTX_DOCUMENTS_ENABLED: false,
      },
    },
    logLevel: "fatal",
    settings: { VALIDATION_LEVEL: "fast" },
  });
  runtime.registerModel(
    ModelType.TEXT_EMBEDDING,
    async (_runtime, params) =>
      embedding(typeof params.text === "string" ? params.text : ""),
    "deterministic-test",
  );
  await runtime.initialize();
  await runtime.getServiceLoadPromise("documents");
  // Match the authenticated web-chat world and owner role used by chat-routes.
  await runtime.ensureConnection({
    entityId: OWNER,
    roomId: AGENT,
    worldId: AGENT,
    userName: "Owner",
    source: "client_chat",
    type: ChannelType.DM,
    metadata: { ownership: { ownerId: OWNER }, roles: { [OWNER]: "OWNER" } },
  });
  const world = await runtime.getWorld(AGENT);
  if (!world) throw new Error("TEST_OWNER_WORLD_MISSING");
  await runtime.updateWorld({
    ...world,
    metadata: {
      ...world.metadata,
      ownership: { ownerId: OWNER },
      roles: { [OWNER]: "OWNER" },
    },
  });
  return runtime;
}

async function invoke(
  runtime: AgentRuntime,
  method: string,
  path: string,
  body?: object,
  requester = owner,
) {
  const { res, getJson, getStatus } = createMockHttpResponse();
  const url = new URL(path, "http://localhost:2138");
  await handleKnowledgeRoutes({
    runtime,
    requester,
    method,
    pathname: url.pathname,
    url,
    req: createMockIncomingMessage({ method, url: path }),
    res,
    readJsonBody: async () => body as never,
    json: (response, value, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(value));
    },
    error: (response, error, status = 400) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error }));
    },
  });
  return {
    status: getStatus(),
    data: getJson() as {
      failureCount: number;
      successCount: number;
      documentCount: number;
      documentId: UUID;
      documents: unknown[];
      document: {
        content: { text: string };
        metadata: Record<string, unknown>;
      };
      results: Array<{ documentId: UUID; text: string }>;
    },
  };
}

function message(text: string, entityId = OWNER): Memory {
  return {
    id: crypto.randomUUID() as UUID,
    agentId: AGENT,
    entityId,
    roomId: AGENT,
    content: { text },
    createdAt: Date.now(),
  };
}

describe("Alice knowledge through the pinned native documents service", () => {
  test("ingests, retrieves and restores document content, metadata and realistic embeddings through the existing durable adapter", async () => {
    const transport = new PersistedTransport();
    const first = await runtimeFor(transport);
    let restored: AgentRuntime | undefined;
    try {
      expect(runtimeKnowledgeEnabled(first)).toBe(true);
      expect((await getKnowledgeService(first)).service).toBeInstanceOf(
        DocumentService,
      );
      const uploaded = await invoke(
        first,
        "POST",
        "/api/knowledge/documents/bulk",
        { documents },
      );
      expect(uploaded.status).toBe(200);
      expect(uploaded.data.failureCount).toBe(0);
      expect(uploaded.data.successCount).toBe(documents.length);
      const ids = uploaded.data.results.map((result) => result.documentId);
      expect(new Set(ids).size).toBe(documents.length);
      const repeated = await invoke(
        first,
        "POST",
        "/api/knowledge/documents/bulk",
        { documents },
      );
      expect(repeated.data.failureCount).toBe(0);
      expect(repeated.data.results.map((result) => result.documentId)).toEqual(
        ids,
      );

      if (process.env.ALICE_TEST_LEGACY_ADAPTER_PATH) {
        const { createAliceD1DatabaseAdapter: createLegacy } = await import(
          process.env.ALICE_TEST_LEGACY_ADAPTER_PATH
        );
        const legacy = createLegacy({
          ownerId: "alice-owner-production",
          transport,
        });
        await legacy.initialize();
        const legacyDocuments: Memory[] = await legacy.getMemories({
          tableName: "documents",
          roomId: AGENT,
        });
        expect(legacyDocuments).toHaveLength(documents.length);
        for (let index = 0; index < documents.length; index++) {
          expect(
            legacyDocuments.find((doc) => doc.id === ids[index])?.content.text,
          ).toBe(documents[index].content);
        }
        // The prior deployed writer can still append chat, then the new reader
        // restores both that chat and every canonical document embedding.
        const chat = message("Rollback compatibility chat marker");
        await legacy.createMemories([{ memory: chat, tableName: "messages" }]);
        const oldRestart = createLegacy({
          ownerId: "alice-owner-production",
          transport,
        });
        await oldRestart.initialize();
        expect(
          (
            await oldRestart.getMemories({
              tableName: "messages",
              roomId: AGENT,
            })
          )[0]?.content.text,
        ).toBe(chat.content.text);
        console.info(
          "Prior deployed adapter restored all document text and persisted chat across replacement",
        );
      }
      restored = await runtimeFor(transport);
      const listing = await invoke(
        restored,
        "GET",
        "/api/knowledge/documents?limit=100",
      );
      expect(listing.data.documents).toHaveLength(documents.length);
      for (let index = 0; index < documents.length; index++) {
        const detail = await invoke(
          restored,
          "GET",
          "/api/knowledge/documents/" + ids[index],
        );
        expect(detail.data.document.content.text).toBe(
          documents[index].content,
        );
        const native = restored.getService<DocumentService>("documents")!;
        const stored = await native.getDocumentByIdWithAccessContext(
          ids[index],
          owner,
        );
        expect(stored?.metadata?.scope).toBe("owner-private");
        for (const [key, value] of Object.entries(
          documents[index].metadata ?? {},
        )) {
          expect(stored?.metadata?.[key]).toEqual(value);
          expect(detail.data.document.metadata[key]).toEqual(value);
        }
        const fragments = await native.listDocumentFragmentsWithAccessContext(
          ids[index],
          owner,
        );
        // Pinned native processor defaults: 500 tokens, 100 token overlap.
        const expectedChunks = await splitChunks(
          documents[index].content,
          500,
          100,
        );
        expect(fragments.length).toBe(expectedChunks.length);
        expect(
          fragments
            .map(
              (fragment) =>
                (fragment.metadata as Record<string, unknown>)?.position,
            )
            .sort((a, b) => Number(a) - Number(b)),
        ).toEqual(expectedChunks.map((_, position) => position));
        expect(
          fragments.every((fragment) => fragment.embedding?.length === 1024),
        ).toBe(true);
      }
      const searched = await invoke(
        restored,
        "GET",
        "/api/knowledge/search?q=Pump.fun&threshold=0&limit=20",
      );
      expect(searched.status).toBe(200);
      expect(
        searched.data.results.some((hit) => hit.text.includes("Pump.fun")),
      ).toBe(true);
      const context = await documentsProvider.get(
        restored,
        message("What is the Pump.fun destination?"),
        {} as State,
      );
      expect(context.text).toContain("Pump.fun");
      const service = restored.getService<DocumentService>("documents")!;
      const privateHits = await service.searchDocuments(
        message("Pump.fun", GUEST),
        undefined,
        "keyword",
        { requesterEntityId: GUEST, role: "USER" },
      );
      expect(privateHits).toEqual([]);
      expect(transport.maxRecordBytes).toBeLessThanOrEqual(1_000_000);
      expect(transport.maxMutations).toBeLessThanOrEqual(100);
      console.info(
        JSON.stringify({
          documents: documents.length,
          maxRecordBytes: transport.maxRecordBytes,
          maxMutations: transport.maxMutations,
          restored: true,
          providerContext: true,
          embeddingDimensions: 1024,
        }),
      );
    } finally {
      await first.stop();
      await restored?.stop();
    }
  }, 60_000);

  test("native update and owner API delete persist exact document and fragment integrity", async () => {
    const transport = new PersistedTransport();
    const first = await runtimeFor(transport);
    let restored: AgentRuntime | undefined;
    let final: AgentRuntime | undefined;
    try {
      const uploaded = await invoke(first, "POST", "/api/knowledge/documents", {
        filename: "change.md",
        contentType: "text/markdown",
        content: "Initial native document marker.",
      });
      expect(uploaded.status).toBe(200);
      const id = uploaded.data.documentId as UUID;
      const native = first.getService<DocumentService>("documents")!;
      const before = await native.listDocumentFragmentsWithAccessContext(
        id,
        owner,
      );
      const replacementText =
        "Replacement native document marker, verified after restart.";
      await native.updateDocument({
        documentId: id,
        content: replacementText,
        accessContext: owner,
      });
      restored = await runtimeFor(transport);
      const service = restored.getService<DocumentService>("documents")!;
      expect(
        (await service.getDocumentByIdWithAccessContext(id, owner))?.content
          .text,
      ).toBe(replacementText);
      const fragments = await service.listDocumentFragmentsWithAccessContext(
        id,
        owner,
      );
      expect(fragments).toHaveLength(1);
      expect(fragments[0].content.text).toContain(replacementText);
      expect(
        await restored.getMemoriesByIds(before.map((fragment) => fragment.id!)),
      ).toEqual([]);
      const hits = await service.searchDocuments(
        message("Replacement native document marker"),
        undefined,
        "keyword",
        owner,
      );
      expect(
        hits.some((hit) => hit.content.text?.includes(replacementText)),
      ).toBe(true);
      const successorText = "Current canon: orbital lanterns.";
      const successorMetadata = {
        source_sha256: { "TEST:revision-2": "b".repeat(64) },
      };
      const successor = await invoke(
        restored,
        "POST",
        "/api/knowledge/documents",
        {
          filename: "change.md",
          contentType: "text/markdown",
          content: successorText,
          metadata: successorMetadata,
        },
      );
      expect(successor.status).toBe(200);
      const successorId = successor.data.documentId;
      expect(successorId).not.toBe(id);
      const successorDetail = await invoke(
        restored,
        "GET",
        `/api/knowledge/documents/${successorId}`,
      );
      expect(successorDetail.data.document.content.text).toBe(successorText);
      expect(successorDetail.data.document.metadata).toMatchObject(
        successorMetadata,
      );
      const successorFragments =
        await service.listDocumentFragmentsWithAccessContext(
          successorId,
          owner,
        );
      const path = `/api/knowledge/documents/${id}`;
      const denied = await invoke(restored, "DELETE", path, undefined, {
        requesterEntityId: GUEST,
        role: "USER",
      });
      expect(denied.status).toBe(403);
      expect(
        await restored.getMemoriesByIds([
          id,
          ...fragments.map((fragment) => fragment.id!),
        ]),
      ).toHaveLength(2);
      const removed = await invoke(restored, "DELETE", path);
      expect(removed.status).toBe(200);
      expect(removed.data).toEqual({
        ok: true,
        deletedFragments: fragments.length,
      });
      final = await runtimeFor(transport);
      const deleted = final.getService<DocumentService>("documents")!;
      expect(
        (await deleted.getDocumentByIdWithAccessContext(successorId, owner))
          ?.content.text,
      ).toBe(successorText);
      expect(
        await deleted.listDocumentFragmentsWithAccessContext(
          successorId,
          owner,
        ),
      ).toEqual(successorFragments);
      expect(
        (await deleted.getDocumentByIdWithAccessContext(successorId, owner))
          ?.metadata,
      ).toMatchObject(successorMetadata);
      expect(
        await deleted.getDocumentByIdWithAccessContext(id, owner),
      ).toBeNull();
      expect(
        await final.getMemoriesByIds([
          id,
          ...fragments.map((fragment) => fragment.id!),
        ]),
      ).toEqual([]);
      expect(
        await deleted.searchDocuments(
          message("Replacement native document marker"),
          undefined,
          "keyword",
          owner,
        ),
      ).toEqual([]);
    } finally {
      await first.stop();
      await restored?.stop();
      await final?.stop();
    }
  });

  test("rejects malformed uploads and non-owner management without creating documents", async () => {
    const runtime = await runtimeFor(new PersistedTransport());
    try {
      const malformed = await invoke(
        runtime,
        "POST",
        "/api/knowledge/documents",
        { content: {}, filename: "bad.md" },
      );
      expect(malformed.status).toBe(400);
      const denied = await invoke(
        runtime,
        "POST",
        "/api/knowledge/documents",
        documents[0],
        { requesterEntityId: GUEST, role: "USER" },
      );
      expect(denied.status).toBe(403);
      const stats = await invoke(runtime, "GET", "/api/knowledge/stats");
      expect(stats.data.documentCount).toBe(0);
    } finally {
      await runtime.stop();
    }
  });
});
