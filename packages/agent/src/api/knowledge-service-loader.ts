import type {
  AccessContext,
  AgentRuntime,
  Memory,
  Service,
  UUID,
} from "@elizaos/core";

export interface KnowledgeServiceLike {
  addDocument(options: {
    agentId?: UUID;
    worldId: UUID;
    roomId: UUID;
    entityId: UUID;
    clientDocumentId: UUID;
    contentType: string;
    originalFilename: string;
    content: string;
    metadata?: Record<string, unknown>;
    scope?: "owner-private";
    addedBy?: UUID;
    addedByRole?: "OWNER";
    addedFrom?: "upload" | "url";
  }): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }>;
  searchDocuments(
    message: Memory,
    scope?: { roomId?: UUID; worldId?: UUID; entityId?: UUID },
    searchMode?: "hybrid" | "vector" | "keyword",
    accessContext?: AccessContext,
  ): Promise<
    Array<{
      id: UUID;
      content: { text?: string };
      similarity?: number;
      metadata?: Record<string, unknown>;
    }>
  >;
  listAllDocumentsWithAccessContext(context: AccessContext): Promise<Memory[]>;
  getDocumentByIdWithAccessContext(
    id: UUID,
    context: AccessContext,
  ): Promise<Memory | null>;
  listDocumentFragmentsWithAccessContext(
    id: UUID,
    context: AccessContext,
  ): Promise<Memory[]>;
  deleteDocumentWithAccessContext(
    id: UUID,
    context: AccessContext,
  ): Promise<void>;
}

export type KnowledgeLoadFailReason =
  | "timeout"
  | "runtime_unavailable"
  | "not_registered";

export interface KnowledgeServiceResult {
  service: KnowledgeServiceLike | null;
  reason?: KnowledgeLoadFailReason;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;

export function getKnowledgeTimeoutMs(): number {
  const envVal = process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS;
  if (!envVal) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(envVal, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, MAX_TIMEOUT_MS);
}

export async function getKnowledgeService(
  runtime: AgentRuntime | null,
): Promise<KnowledgeServiceResult> {
  if (!runtime) {
    return { service: null, reason: "runtime_unavailable" };
  }

  let service = runtime.getService<Service & KnowledgeServiceLike>("documents");
  if (service) return { service };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const servicePromise = runtime.getServiceLoadPromise("documents");
    const timeoutMs = getKnowledgeTimeoutMs();
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("knowledge service timeout")),
        timeoutMs,
      );
    });
    await Promise.race([servicePromise, timeout]);
    service = runtime.getService<Service & KnowledgeServiceLike>("documents");
    if (service) return { service };
    return { service: null, reason: "not_registered" };
  } catch {
    return { service: null, reason: "timeout" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
