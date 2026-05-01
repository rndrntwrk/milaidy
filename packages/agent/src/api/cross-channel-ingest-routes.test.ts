import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleCrossChannelIngestRoutes } from "./cross-channel-ingest-routes";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-ingest-routes-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeContext({
  method,
  pathname,
  body,
  rootDir,
  config,
  url = `http://localhost${pathname}`,
}: {
  method: string;
  pathname: string;
  body?: Record<string, unknown>;
  rootDir: string;
  config?: Record<string, unknown>;
  url?: string;
}) {
  const jsonCalls: Array<{ data: unknown; status?: number }> = [];
  const errorCalls: Array<{ message: string; status?: number }> = [];
  return {
    ctx: {
      req: {} as never,
      res: {} as never,
      method,
      pathname,
      url: new URL(url),
      stateDir: rootDir,
      config,
      readJsonBody: async () => body ?? {},
      json: (_res: unknown, data: unknown, status?: number) => {
        jsonCalls.push({ data, status });
      },
      error: (_res: unknown, message: string, status?: number) => {
        errorCalls.push({ message, status });
      },
    },
    jsonCalls,
    errorCalls,
  };
}

describe("handleCrossChannelIngestRoutes", () => {
  it("ingests normalized comments through the HTTP handler", async () => {
    const rootDir = makeTempDir();
    const { ctx, jsonCalls } = makeContext({
      method: "POST",
      pathname: "/api/ingest/comments",
      rootDir,
      body: {
        source: "github",
        externalId: "gh1",
        threadId: "pr1",
        body: "Review this before production",
      },
    });

    await expect(handleCrossChannelIngestRoutes(ctx)).resolves.toBe(true);

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      created: true,
      comment: {
        source: "github",
        externalId: "gh1",
        actionability: "needs_review",
      },
    });
  });

  it("ingests source payloads and exposes status/list endpoints", async () => {
    const rootDir = makeTempDir();
    await handleCrossChannelIngestRoutes(
      makeContext({
        method: "POST",
        pathname: "/api/ingest/comments",
        rootDir,
        body: {
          source: "slack",
          payload: {
            team: "T1",
            channel: "C1",
            ts: "1777639200.000100",
            text: "Corpus update needed",
            user: "U1",
          },
        },
      }).ctx,
    );

    const status = makeContext({
      method: "GET",
      pathname: "/api/ingest/comments/status",
      rootDir,
    });
    await handleCrossChannelIngestRoutes(status.ctx);

    expect(status.jsonCalls[0]?.data).toMatchObject({
      ok: true,
      status: {
        total: 1,
        bySource: { slack: 1 },
      },
    });

    const list = makeContext({
      method: "GET",
      pathname: "/api/ingest/comments",
      rootDir,
      url: "http://localhost/api/ingest/comments?source=slack&limit=10",
    });
    await handleCrossChannelIngestRoutes(list.ctx);

    expect(list.jsonCalls[0]?.data).toMatchObject({
      ok: true,
      total: 1,
      items: [{ source: "slack", channelId: "C1" }],
    });
  });

  it("rejects unsupported ingest sources", async () => {
    const { ctx, errorCalls } = makeContext({
      method: "POST",
      pathname: "/api/ingest/comments",
      rootDir: makeTempDir(),
      body: {
        source: "x-twitter",
        payload: {},
      },
    });

    await expect(handleCrossChannelIngestRoutes(ctx)).resolves.toBe(true);
    expect(errorCalls).toEqual([
      { message: "Unsupported cross-channel source", status: 400 },
    ]);
  });

  it("honors the configured Alice ingest store directory", async () => {
    const rootDir = makeTempDir();
    const customStoreDir = path.join(makeTempDir(), "custom-ingest");
    const { ctx } = makeContext({
      method: "POST",
      pathname: "/api/ingest/comments",
      rootDir,
      config: {
        alice: {
          ingest: {
            storeDir: customStoreDir,
          },
        },
      },
      body: {
        source: "ops",
        externalId: "run-1",
        threadId: "alice-prod",
        body: "prod deploy requires approval",
      },
    });

    await handleCrossChannelIngestRoutes(ctx);

    expect(fs.existsSync(path.join(customStoreDir, "comments.json"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "ingest", "comments", "comments.json"))).toBe(
      false,
    );
  });

  it("rejects sources disabled by Alice ingest config", async () => {
    const { ctx, errorCalls } = makeContext({
      method: "POST",
      pathname: "/api/ingest/comments",
      rootDir: makeTempDir(),
      config: {
        alice: {
          ingest: {
            sources: ["github"],
          },
        },
      },
      body: {
        source: "slack",
        externalId: "slack-1",
        threadId: "thread-1",
        body: "should not ingest",
      },
    });

    await handleCrossChannelIngestRoutes(ctx);

    expect(errorCalls).toEqual([
      { message: "Cross-channel source is disabled", status: 403 },
    ]);
  });
});
