import * as dns from "node:dns/promises";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import {
  __setPinnedFetchImplForTests,
  handleKnowledgeRoutes,
} from "@miladyai/agent/api/knowledge-routes.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const AGENT_ID = "00000000-0000-0000-0000-000000000001" as UUID;

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: uuid(9000),
    agentId: AGENT_ID,
    roomId: AGENT_ID,
    entityId: AGENT_ID,
    content: { text: "" },
    createdAt: 1,
    ...overrides,
  } as unknown as Memory;
}

describe("knowledge routes", () => {
  let runtime: AgentRuntime | null;
  let addDocumentMock: ReturnType<typeof vi.fn>;
  let listDocumentsMock: ReturnType<typeof vi.fn>;
  let fragmentsMock: ReturnType<typeof vi.fn>;
  let deleteDocumentMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    __setPinnedFetchImplForTests(({ url, init }) => {
      return fetch(url.toString(), init);
    });
    addDocumentMock = vi.fn(async () => ({
      clientDocumentId: uuid(1111),
      storedDocumentMemoryId: uuid(1112),
      fragmentCount: 0,
    }));
    listDocumentsMock = vi.fn(async () => []);
    deleteDocumentMock = vi.fn(async () => undefined);
    fragmentsMock = vi.fn(async () => []);

    const knowledgeService = {
      addDocument: addDocumentMock,
      searchDocuments: vi.fn(async () => []),
      listAllDocumentsWithAccessContext: listDocumentsMock,
      getDocumentByIdWithAccessContext: async (id: UUID) =>
        (await listDocumentsMock()).find((doc: Memory) => doc.id === id) ??
        null,
      listDocumentFragmentsWithAccessContext: fragmentsMock,
      deleteDocumentWithAccessContext: deleteDocumentMock,
    };

    runtime = {
      agentId: AGENT_ID,
      getService: (name: string) =>
        name === "documents" ? knowledgeService : null,
      getServiceLoadPromise: async () => undefined,
    } as unknown as AgentRuntime;
  });

  afterEach(() => {
    __setPinnedFetchImplForTests(null);
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    AgentRuntime | null,
    Record<string, unknown>
  >(
    async (ctx) => {
      try {
        return await handleKnowledgeRoutes({
          req: ctx.req,
          res: ctx.res,
          method: ctx.method,
          pathname: ctx.pathname,
          url: new URL(ctx.req.url ?? ctx.pathname, "http://localhost:2138"),
          runtime: ctx.runtime,
          requester: { requesterEntityId: AGENT_ID, role: "OWNER" },
          readJsonBody: async () => ctx.readJsonBody(),
          json: (res, data, status) => ctx.json(res, data, status),
          error: (res, message, status) => ctx.error(res, message, status),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.error(ctx.res, message, 400);
        return true;
      }
    },
    { runtimeProvider: () => runtime },
  );

  test("paginates visible documents and preserves native fragment counts", async () => {
    listDocumentsMock.mockResolvedValue([
      buildMemory({ id: uuid(1), content: { text: "first" } }),
      buildMemory({
        id: uuid(2),
        metadata: {
          filename: "second.md",
          contentType: "text/markdown",
          fileSize: "2048",
        },
      }),
    ]);
    fragmentsMock.mockResolvedValue([buildMemory(), buildMemory()]);
    const result = await invoke({
      method: "GET",
      pathname: "/api/knowledge/documents",
      url: "/api/knowledge/documents?limit=1&offset=1",
    });
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      documents: [
        {
          id: uuid(2),
          filename: "second.md",
          contentType: "text/markdown",
          fileSize: 2048,
          fragmentCount: 2,
        },
      ],
      limit: 1,
      offset: 1,
    });
    expect(listDocumentsMock).toHaveBeenCalledWith({
      requesterEntityId: AGENT_ID,
      role: "OWNER",
    });
  });

  test("returns visible document detail and denies a missing document", async () => {
    listDocumentsMock.mockResolvedValue([
      buildMemory({
        id: uuid(2),
        content: { text: "document body" },
        metadata: { filename: "notes.md" },
      }),
    ]);
    fragmentsMock.mockResolvedValue([buildMemory()]);
    const found = await invoke({
      method: "GET",
      pathname: "/api/knowledge/documents/" + uuid(2),
    });
    expect(found.status).toBe(200);
    expect(found.payload).toMatchObject({
      document: {
        filename: "notes.md",
        content: { text: "document body" },
        fragmentCount: 1,
      },
    });
    const missing = await invoke({
      method: "GET",
      pathname: "/api/knowledge/documents/" + uuid(3),
    });
    expect(missing.status).toBe(404);
  });

  test("orders authorized fragments and omits malformed fragment records", async () => {
    fragmentsMock.mockResolvedValue([
      buildMemory({ id: undefined }),
      buildMemory({ id: uuid(1), createdAt: undefined }),
      buildMemory({
        id: uuid(2),
        metadata: { position: 2 },
        content: { text: "second" },
      }),
      buildMemory({
        id: uuid(3),
        metadata: { position: 1 },
        content: { text: "first" },
      }),
    ]);
    const result = await invoke({
      method: "GET",
      pathname: "/api/knowledge/fragments/" + uuid(4),
    });
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      count: 2,
      fragments: [{ text: "first" }, { text: "second" }],
    });
  });

  test("deletes through the native authorized document operation", async () => {
    fragmentsMock.mockResolvedValue([buildMemory()]);
    const result = await invoke({
      method: "DELETE",
      pathname: "/api/knowledge/documents/" + uuid(4),
    });
    expect(result.status).toBe(200);
    expect(deleteDocumentMock).toHaveBeenCalledWith(uuid(4), {
      requesterEntityId: AGENT_ID,
      role: "OWNER",
    });
    expect(result.payload).toMatchObject({ ok: true, deletedFragments: 1 });
  });

  test("bulk document upload ingests valid documents and reports validation errors", async () => {
    addDocumentMock
      .mockResolvedValueOnce({
        clientDocumentId: uuid(3001),
        storedDocumentMemoryId: uuid(3101),
        fragmentCount: 2,
      })
      .mockResolvedValueOnce({
        clientDocumentId: uuid(3002),
        storedDocumentMemoryId: uuid(3102),
        fragmentCount: 1,
      });

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/bulk",
      body: {
        documents: [
          {
            content: "alpha",
            filename: "docs/alpha.md",
            contentType: "text/markdown",
          },
          {
            content: "missing filename",
            filename: "",
          },
          {
            content: "beta",
            filename: "docs/beta.txt",
            contentType: "text/plain",
          },
        ],
      },
    });

    expect(result.status).toBe(200);
    expect(addDocumentMock).toHaveBeenCalledTimes(2);
    expect(addDocumentMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        originalFilename: "docs/alpha.md",
        content: "alpha",
      }),
    );
    expect(addDocumentMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        originalFilename: "docs/beta.txt",
        content: "beta",
      }),
    );
    expect(result.payload).toMatchObject({
      ok: false,
      total: 3,
      successCount: 2,
      failureCount: 1,
    });
    expect(
      (result.payload as { results: Array<{ index: number; ok: boolean }> })
        .results,
    ).toEqual([
      expect.objectContaining({
        index: 0,
        ok: true,
        filename: "docs/alpha.md",
      }),
      expect.objectContaining({
        index: 1,
        ok: false,
        error: "content and filename must be non-empty strings",
      }),
      expect.objectContaining({
        index: 2,
        ok: true,
        filename: "docs/beta.txt",
      }),
    ]);
  });

  test("bulk document upload continues when one document fails", async () => {
    addDocumentMock
      .mockResolvedValueOnce({
        clientDocumentId: uuid(3201),
        storedDocumentMemoryId: uuid(3301),
        fragmentCount: 2,
      })
      .mockRejectedValueOnce(new Error("embedding service unavailable"));

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/bulk",
      body: {
        documents: [
          {
            content: "first",
            filename: "batch/first.md",
            contentType: "text/markdown",
          },
          {
            content: "second",
            filename: "batch/second.md",
            contentType: "text/markdown",
          },
        ],
      },
    });

    expect(result.status).toBe(200);
    expect(addDocumentMock).toHaveBeenCalledTimes(2);
    expect(result.payload).toMatchObject({
      ok: false,
      total: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(
      (result.payload as { results: Array<{ index: number; ok: boolean }> })
        .results,
    ).toEqual([
      expect.objectContaining({
        index: 0,
        ok: true,
        filename: "batch/first.md",
      }),
      expect.objectContaining({
        index: 1,
        ok: false,
        filename: "batch/second.md",
        error: expect.stringContaining("embedding service unavailable"),
      }),
    ]);
  });

  test("bulk document upload rejects requests exceeding max document count", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/bulk",
      body: {
        documents: Array.from({ length: 101 }, (_, index) => ({
          content: `doc-${index}`,
          filename: `doc-${index}.md`,
          contentType: "text/markdown",
        })),
      },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "exceeds limit",
    );
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("blocks URL import to loopback hosts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://127.0.0.1:8000/secrets" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("blocks URL import to IPv6 link-local hosts outside fe80::/16", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://[fea0::1]/x" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("blocks URL import when DNS resolves to link-local/metadata IP", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://metadata.nip.io/latest/meta-data" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("pins URL import connection to the validated DNS address", async () => {
    const lookupSpy = vi
      .spyOn(dns, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const transportSpy = vi.fn(async () => {
      return new Response("hello", {
        status: 200,
        headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      });
    });
    __setPinnedFetchImplForTests(transportSpy);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/rebind" },
    });

    expect(result.status).toBe(200);
    expect(lookupSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(transportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          hostname: "example.com",
          pinnedAddress: "93.184.216.34",
        }),
      }),
    );
    expect(addDocumentMock).toHaveBeenCalledTimes(1);
  });

  test("allows URL import for public hosts", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      arrayBuffer: async () => new TextEncoder().encode("hello").buffer,
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/doc.txt" },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      contentType: "text/plain; charset=utf-8",
      filename: "doc.txt",
      isYouTubeTranscript: false,
    });
    expect(addDocumentMock).toHaveBeenCalledTimes(1);
  });

  test("blocks URL import when fetch responds with redirect", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: new Headers({ location: "http://169.254.169.254/latest" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/redirect" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "redirects are not allowed",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/redirect",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("rejects URL import when declared content-length exceeds max size", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(10 * 1024 * 1024 + 1),
      }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("small"));
          controller.close();
        },
      }),
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/huge.txt" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "maximum size",
    );
    expect(fetchSpy).toHaveBeenCalled();
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("rejects URL import when streamed body exceeds max size", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);

    const chunk = new Uint8Array(256 * 1024); // 256 KiB
    let chunksSent = 0;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "content-type": "text/plain; charset=utf-8",
      }),
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunksSent >= 41) {
            controller.close();
            return;
          }
          chunksSent += 1;
          controller.enqueue(chunk);
        },
      }),
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/chunked.txt" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "maximum size",
    );
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("rejects YouTube import when watch page exceeds max size", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "142.250.190.14", family: 4 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "content-type": "text/html; charset=utf-8",
        "content-length": String(2 * 1024 * 1024 + 1),
      }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("small"));
          controller.close();
        },
      }),
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "maximum size",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("rejects YouTube import when transcript exceeds max size", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "142.250.190.14", family: 4 },
    ]);

    const watchHtml =
      '{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?lang=en"}]}';
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "text/html; charset=utf-8",
          "content-length": String(new TextEncoder().encode(watchHtml).length),
        }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(watchHtml));
            controller.close();
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "application/xml; charset=utf-8",
          "content-length": String(10 * 1024 * 1024 + 1),
        }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("<transcript></transcript>"),
            );
            controller.close();
          },
        }),
      } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "maximum size",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  test("rejects URL import when upstream fetch aborts", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/slow.txt" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("timed out");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(addDocumentMock).not.toHaveBeenCalled();
  });
});
