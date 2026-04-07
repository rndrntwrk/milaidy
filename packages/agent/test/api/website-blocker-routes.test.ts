import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WebsiteBlockerRouteContext } from "../../src/api/website-blocker-routes";
import { handleWebsiteBlockerRoutes } from "../../src/api/website-blocker-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

let tempDir = "";
let hostsFilePath = "";

function buildCtx(
  method: string,
  pathname: string,
  body?: Record<string, unknown>,
): WebsiteBlockerRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => body ?? null),
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-api-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
    hostsFilePath = "";
  }
});

describe("website-blocker-routes", () => {
  test("GET /api/website-blocker returns the blocker status", async () => {
    const ctx = buildCtx("GET", "/api/website-blocker");

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      active: false,
      available: true,
      engine: "hosts-file",
      hostsFilePath,
      requiresElevation: false,
    });
  });

  test("PUT /api/website-blocker starts a block from explicit websites", async () => {
    const ctx = buildCtx("PUT", "/api/website-blocker", {
      websites: ["x.com", "twitter.com"],
      durationMinutes: 30,
    });

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const [_, payload, status] = (ctx.json as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      request: {
        websites: ["x.com", "twitter.com"],
        durationMinutes: 30,
      },
    });

    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  test("PUT /api/website-blocker can parse website text without chat state", async () => {
    const ctx = buildCtx("PUT", "/api/website-blocker", {
      text: "Block x.com until I unblock it.",
    });

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      request: {
        websites: ["x.com"],
        durationMinutes: null,
      },
    });
  });

  test("DELETE /api/website-blocker removes an active block", async () => {
    await handleWebsiteBlockerRoutes(
      buildCtx("PUT", "/api/website-blocker", {
        websites: ["x.com"],
        durationMinutes: 15,
      }),
    );

    const ctx = buildCtx("DELETE", "/api/website-blocker");
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      removed: true,
      status: {
        active: false,
        websites: [],
      },
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});
