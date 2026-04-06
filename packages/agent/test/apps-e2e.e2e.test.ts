/**
 * E2E tests for the Apps system — NO MOCKS.
 *
 * Starts a real API server and tests the full apps flow:
 * - GET /api/apps (list from real registry or cached data)
 * - GET /api/apps/search?q=... (search)
 * - GET /api/apps/installed (check installed apps)
 * - POST /api/apps/launch (install plugin + return viewer)
 * - GET /api/apps/info/:name (app detail)
 *
 * 2004scape tests hit the always-live remote server (rs-sdk-demo.fly.dev):
 * - Launch returns viewer URL pointing to remote server
 * - PostMessage auth with auto-provisioned credentials
 * - RS_SDK_SERVER_URL override support
 */
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";
import { req } from "../../../test/helpers/http";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

interface ApiResponse {
  status: number;
  data: JsonValue;
}

interface AppEntry {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl?: string | null;
}

function asObject(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function asArray(value: JsonValue): JsonArray {
  return Array.isArray(value) ? value : [];
}

async function api(
  port: number,
  method: string,
  path: string,
  body?: JsonObject,
): Promise<ApiResponse> {
  const result = await req(port, method, path, body as Record<string, unknown>);
  return { status: result.status, data: result.data as JsonValue };
}

async function rawApi(
  port: number,
  method: string,
  path: string,
  rawBody: string,
  contentType = "application/json",
): Promise<ApiResponse> {
  const result = await req(port, method, path, rawBody, contentType);
  return { status: result.status, data: result.data as JsonValue };
}

function toAppList(data: JsonValue): AppEntry[] {
  if (!Array.isArray(data)) return [];
  const apps: AppEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item;
    if (
      typeof row.name === "string" &&
      typeof row.displayName === "string" &&
      typeof row.description === "string" &&
      typeof row.category === "string" &&
      typeof row.launchType === "string"
    ) {
      apps.push({
        name: row.name,
        displayName: row.displayName,
        description: row.description,
        category: row.category,
        launchType: row.launchType,
        launchUrl:
          typeof row.launchUrl === "string" || row.launchUrl === null
            ? row.launchUrl
            : undefined,
      });
    }
  }
  return apps;
}

const KNOWN_LOCAL_APP_NAME = "@elizaos/app-hyperscape";

/** Check if a TCP port is listening. */
function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

interface HttpTarget {
  baseUrl: string;
  host: string;
  port: number;
}

function parseHttpTarget(rawUrl: string): HttpTarget | null {
  if (!rawUrl || rawUrl.startsWith("/")) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 80;
    if (!Number.isFinite(port)) return null;
    return {
      baseUrl: `${url.protocol}//${url.hostname}:${port}`,
      host: url.hostname,
      port,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Apps E2E", () => {
  let server: { port: number; close: () => Promise<void> };

  beforeAll(async () => {
    server = await startApiServer({ port: 0 });
  }, 30_000);

  afterAll(async () => {
    if (server) await server.close();
  });

  // ===================================================================
  //  1. App listing
  // ===================================================================

  describe("GET /api/apps", () => {
    it("returns 200 with an array", async () => {
      const response = await api(server.port, "GET", "/api/apps");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("app entries have required fields and valid launch metadata", async () => {
      const response = await api(server.port, "GET", "/api/apps");
      const apps = toAppList(response.data);
      // Registry may or may not have network data, but local app wrappers should exist.
      expect(apps.length).toBeGreaterThan(0);
      for (const app of apps.slice(0, 8)) {
        expect(app.name.length).toBeGreaterThan(0);
        expect(app.displayName.length).toBeGreaterThan(0);
        expect(app.category.length).toBeGreaterThan(0);
        expect(app.launchType.length).toBeGreaterThan(0);
        if (app.launchUrl !== undefined) {
          expect(app.launchUrl === null || app.launchUrl.length > 0).toBe(true);
        }
      }
    });
  });

  // ===================================================================
  //  2. App search
  // ===================================================================

  describe("GET /api/apps/search", () => {
    it("returns empty array for empty query", async () => {
      const { status, data } = await api(
        server.port,
        "GET",
        "/api/apps/search?q=",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(asArray(data).length).toBe(0);
    });

    it("returns empty array for whitespace-only query", async () => {
      const { status, data } = await api(
        server.port,
        "GET",
        "/api/apps/search?q=%20%20%20",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(asArray(data).length).toBe(0);
    });

    it("returns array for a query", async () => {
      const response = await api(server.port, "GET", "/api/apps/search?q=game");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("normalizes invalid and out-of-range limit values", async () => {
      const maxLimit = await api(
        server.port,
        "GET",
        "/api/apps/search?q=app&limit=50",
      );
      const invalidLimit = await api(
        server.port,
        "GET",
        "/api/apps/search?q=app&limit=abc",
      );
      const underLimit = await api(
        server.port,
        "GET",
        "/api/apps/search?q=app&limit=0",
      );
      const overLimit = await api(
        server.port,
        "GET",
        "/api/apps/search?q=app&limit=500",
      );

      expect(maxLimit.status).toBe(200);
      expect(invalidLimit.status).toBe(200);
      expect(underLimit.status).toBe(200);
      expect(overLimit.status).toBe(200);
      expect(Array.isArray(maxLimit.data)).toBe(true);
      expect(Array.isArray(invalidLimit.data)).toBe(true);
      expect(Array.isArray(underLimit.data)).toBe(true);
      expect(Array.isArray(overLimit.data)).toBe(true);

      const maxLen = Array.isArray(maxLimit.data) ? maxLimit.data.length : 0;
      const invalidLen = Array.isArray(invalidLimit.data)
        ? invalidLimit.data.length
        : 0;
      const underLen = Array.isArray(underLimit.data)
        ? underLimit.data.length
        : 0;
      const overLen = Array.isArray(overLimit.data) ? overLimit.data.length : 0;

      expect(overLen).toBeLessThanOrEqual(50);
      expect(underLen).toBeLessThanOrEqual(1);
      expect(invalidLen).toBeLessThanOrEqual(15);
      if (maxLen > 0) {
        expect(invalidLen).toBeGreaterThan(0);
      }
    });
  });

  // ===================================================================
  //  3. App info
  // ===================================================================

  describe("GET /api/apps/info/:name", () => {
    it("returns 400 for missing app name segment", async () => {
      const { status, data } = await api(server.port, "GET", "/api/apps/info/");
      expect(status).toBe(400);
      expect(asObject(data).error).toBe("app name is required");
    });

    it("returns 404 for non-existent app", async () => {
      const response = await api(
        server.port,
        "GET",
        "/api/apps/info/%40elizaos%2Fapp-nonexistent",
      );
      expect(response.status).toBe(404);
    });

    it("returns app metadata for an existing app", async () => {
      const encoded = encodeURIComponent(KNOWN_LOCAL_APP_NAME);
      const response = await api(
        server.port,
        "GET",
        `/api/apps/info/${encoded}`,
      );
      const body = asObject(response.data);
      expect(response.status).toBe(200);
      expect(body.name).toBe(KNOWN_LOCAL_APP_NAME);
      expect(typeof body.displayName).toBe("string");
      expect(typeof body.launchType).toBe("string");
    });
  });

  // ===================================================================
  //  4. App installed list
  // ===================================================================

  describe("GET /api/apps/installed", () => {
    it("returns 200 with an array", async () => {
      const response = await api(server.port, "GET", "/api/apps/installed");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("installed entries have stable shape", async () => {
      const response = await api(server.port, "GET", "/api/apps/installed");
      if (!Array.isArray(response.data)) {
        expect(Array.isArray(response.data)).toBe(true);
        return;
      }
      for (const row of response.data.slice(0, 5)) {
        const item = asObject(row);
        expect(typeof item.name).toBe("string");
        expect(typeof item.displayName).toBe("string");
        expect(typeof item.pluginName).toBe("string");
        expect(typeof item.version).toBe("string");
        expect(typeof item.installedAt).toBe("string");
      }
    });
  });

  // ===================================================================
  //  5. App launch
  // ===================================================================

  describe("POST /api/apps/launch", () => {
    it("returns 400 when name is missing", async () => {
      const { status } = await api(server.port, "POST", "/api/apps/launch", {});
      expect(status).toBe(400);
    });

    it("returns 400 when name is empty", async () => {
      const { status } = await api(server.port, "POST", "/api/apps/launch", {
        name: "",
      });
      expect(status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const { status, data } = await rawApi(
        server.port,
        "POST",
        "/api/apps/launch",
        '{"name":',
      );
      expect(status).toBe(400);
      expect(asObject(data).error).toBe("Invalid JSON in request body");
    });

    it("returns 400 when body is a JSON array", async () => {
      const { status, data } = await rawApi(
        server.port,
        "POST",
        "/api/apps/launch",
        '["not","an","object"]',
      );
      expect(status).toBe(400);
      expect(asObject(data).error).toBe("Request body must be a JSON object");
    });

    it("rejects requests when body exceeds size limit", async () => {
      const oversized = JSON.stringify({
        name: `@elizaos/app-${"x".repeat(1_050_000)}`,
      });
      const { status, data } = await rawApi(
        server.port,
        "POST",
        "/api/apps/launch",
        oversized,
        "application/json",
      );
      const body = asObject(data);
      expect(status).toBe(413);
      expect(typeof body.error).toBe("string");
      if (typeof body.error === "string") {
        expect(body.error.includes("maximum size")).toBe(true);
      }
    });

    it("returns error for unknown app name", async () => {
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        {
          name: "@elizaos/app-definitely-does-not-exist-xyz",
        },
      );
      // Should be 500 (app not found in registry throws)
      expect(status).toBe(500);
      expect(asObject(data).error).toBeDefined();
    });

    it("returns launch metadata for known app", async () => {
      const launch = await api(server.port, "POST", "/api/apps/launch", {
        name: KNOWN_LOCAL_APP_NAME,
      });
      expect(launch.status).toBe(200);

      const body = asObject(launch.data);
      expect(typeof body.displayName).toBe("string");
      expect(typeof body.launchType).toBe("string");
      const launchUrl = body.launchUrl;
      expect(launchUrl === null || typeof launchUrl === "string").toBe(true);
      if (
        body.viewer &&
        typeof body.viewer === "object" &&
        !Array.isArray(body.viewer)
      ) {
        const viewer = body.viewer;
        expect(typeof viewer.url).toBe("string");
        if (viewer.sandbox !== undefined) {
          expect(typeof viewer.sandbox).toBe("string");
        }
      }
    });

    it("handles concurrent invalid launch requests", async () => {
      const attempts = await Promise.all(
        Array.from({ length: 3 }, () =>
          api(server.port, "POST", "/api/apps/launch", {
            name: "@elizaos/app-definitely-does-not-exist-xyz",
          }),
        ),
      );

      for (const response of attempts) {
        expect(response.status).toBe(500);
        expect(typeof asObject(response.data).error).toBe("string");
      }
    });
  });

  describe("POST /api/apps/stop", () => {
    it("returns 400 when name is missing", async () => {
      const { status } = await api(server.port, "POST", "/api/apps/stop", {});
      expect(status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const { status, data } = await rawApi(
        server.port,
        "POST",
        "/api/apps/stop",
        '{"name":',
      );
      expect(status).toBe(400);
      expect(asObject(data).error).toBe("Invalid JSON in request body");
    });

    it("returns 400 when body is not a JSON object", async () => {
      const { status, data } = await rawApi(
        server.port,
        "POST",
        "/api/apps/stop",
        '"plain string"',
      );
      expect(status).toBe(400);
      expect(asObject(data).error).toBe("Request body must be a JSON object");
    });

    it("returns 500 for unknown app name", async () => {
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/stop",
        {
          name: "@elizaos/app-definitely-does-not-exist-xyz",
        },
      );
      expect(status).toBe(500);
      expect(asObject(data).error).toBeDefined();
    });

    it("returns stop result payload for a known app", async () => {
      const launch = await api(server.port, "POST", "/api/apps/launch", {
        name: KNOWN_LOCAL_APP_NAME,
      });
      expect(launch.status).toBe(200);

      const response = await api(server.port, "POST", "/api/apps/stop", {
        name: KNOWN_LOCAL_APP_NAME,
      });
      const body = asObject(response.data);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.appName).toBe(KNOWN_LOCAL_APP_NAME);
      expect(typeof body.stoppedAt).toBe("string");
      expect(Number.isNaN(Date.parse(String(body.stoppedAt)))).toBe(false);
      expect(typeof body.pluginUninstalled).toBe("boolean");
      expect(typeof body.needsRestart).toBe("boolean");
      expect(typeof body.stopScope).toBe("string");
      expect(typeof body.message).toBe("string");
    });

    it("returns no-op on repeated stop after app is already disconnected", async () => {
      const response = await api(server.port, "POST", "/api/apps/stop", {
        name: KNOWN_LOCAL_APP_NAME,
      });
      const body = asObject(response.data);
      expect(response.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.stopScope).toBe("no-op");
      expect(typeof body.message).toBe("string");
    });

    it("handles concurrent stop requests for unknown app", async () => {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          api(server.port, "POST", "/api/apps/stop", {
            name: "@elizaos/app-definitely-does-not-exist-xyz",
          }),
        ),
      );
      for (const response of responses) {
        expect(response.status).toBe(500);
        expect(typeof asObject(response.data).error).toBe("string");
      }
    });
  });

  // ===================================================================
  //  6. Route not found
  // ===================================================================

  describe("unknown routes", () => {
    it("returns 404 for unknown app route", async () => {
      const { status } = await api(
        server.port,
        "GET",
        "/api/apps/unknown-route",
      );
      expect(status).toBe(404);
    });
  });

  // ===================================================================
  //  8. Non-app plugin and refresh routes
  // ===================================================================

  describe("plugin registry routes", () => {
    it("GET /api/apps/plugins returns data or upstream error payload", async () => {
      const response = await api(server.port, "GET", "/api/apps/plugins");
      if (response.status === 200) {
        expect(Array.isArray(response.data)).toBe(true);
      } else {
        expect(response.status).toBe(502);
        expect(typeof asObject(response.data).error).toBe("string");
      }
    });

    it("GET /api/apps/plugins/search returns [] for empty query", async () => {
      const response = await api(
        server.port,
        "GET",
        "/api/apps/plugins/search?q=",
      );
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(asArray(response.data).length).toBe(0);
    });

    it("GET /api/apps/plugins/search enforces limit bounds", async () => {
      const maxLimit = await api(
        server.port,
        "GET",
        "/api/apps/plugins/search?q=plugin&limit=50",
      );
      const invalidLimit = await api(
        server.port,
        "GET",
        "/api/apps/plugins/search?q=plugin&limit=abc",
      );
      const overLimit = await api(
        server.port,
        "GET",
        "/api/apps/plugins/search?q=plugin&limit=500",
      );

      for (const res of [maxLimit, invalidLimit, overLimit]) {
        if (res.status === 200) {
          expect(Array.isArray(res.data)).toBe(true);
        } else {
          expect(res.status).toBe(502);
          expect(typeof asObject(res.data).error).toBe("string");
        }
      }

      if (
        maxLimit.status === 200 &&
        invalidLimit.status === 200 &&
        overLimit.status === 200
      ) {
        const maxRows = asArray(maxLimit.data);
        const invalidRows = asArray(invalidLimit.data);
        const overRows = asArray(overLimit.data);
        expect(maxRows.length).toBeLessThanOrEqual(50);
        expect(overRows.length).toBeLessThanOrEqual(50);
        expect(invalidRows.length).toBeLessThanOrEqual(15);
        if (maxRows.length > 0) {
          expect(invalidRows.length).toBeGreaterThan(0);
        }
      }
    });

    it("POST /api/apps/refresh returns count or upstream error", async () => {
      const response = await api(server.port, "POST", "/api/apps/refresh", {});
      if (response.status === 200) {
        const body = asObject(response.data);
        expect(body.ok).toBe(true);
        expect(typeof body.count).toBe("number");
        expect(Number(body.count)).toBeGreaterThanOrEqual(0);
      } else {
        expect(response.status).toBe(502);
        expect(typeof asObject(response.data).error).toBe("string");
      }
    });
  });

  // ===================================================================
  //  9. Concurrent request behavior
  // ===================================================================

  describe("concurrent request behavior", () => {
    it("serves concurrent reads across app endpoints", async () => {
      const responses = await Promise.all([
        api(server.port, "GET", "/api/apps"),
        api(server.port, "GET", "/api/apps/search?q=game"),
        api(server.port, "GET", "/api/apps/installed"),
        api(server.port, "GET", "/api/apps/plugins"),
      ]);

      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      expect(responses[2].status).toBe(200);
      expect([200, 502]).toContain(responses[3].status);
      expect(Array.isArray(responses[0].data)).toBe(true);
      expect(Array.isArray(responses[1].data)).toBe(true);
      expect(Array.isArray(responses[2].data)).toBe(true);
    });
  });

  // ===================================================================
  //  10. 2004scape integration (remote server is always live)
  // ===================================================================

  const RS_SDK_REMOTE_URL = "https://rs-sdk-demo.fly.dev";

  describe("2004scape integration", () => {
    it("remote server is reachable", async () => {
      const res = await fetch(RS_SDK_REMOTE_URL, {
        signal: AbortSignal.timeout(10_000),
      });
      expect(res.status).toBe(200);
    });

    it("remote /bot endpoint returns the game client HTML", async () => {
      const res = await fetch(`${RS_SDK_REMOTE_URL}/bot?bot=e2etest`, {
        signal: AbortSignal.timeout(10_000),
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("<canvas");
    });

    it("launch returns viewer URL pointing to remote server", async () => {
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        { name: "@elizaos/app-2004scape" },
      );
      expect(status).toBe(200);
      const body = asObject(data);
      expect(body.displayName).toBe("2004scape");

      const viewer = asObject(body.viewer as JsonValue);
      expect(typeof viewer.url).toBe("string");
      expect(viewer.url as string).toContain("rs-sdk-demo.fly.dev");
    });

    it("launch includes postMessageAuth and credentials", async () => {
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        { name: "@elizaos/app-2004scape" },
      );
      expect(status).toBe(200);
      const body = asObject(data);
      const viewer = asObject(body.viewer as JsonValue);

      expect(viewer.postMessageAuth).toBe(true);

      const authMsg = asObject(viewer.authMessage as JsonValue);
      expect(authMsg.type).toBe("RS_2004SCAPE_AUTH");
      expect(typeof authMsg.authToken).toBe("string");
      expect((authMsg.authToken as string).length).toBeGreaterThan(0);
      expect(typeof authMsg.sessionToken).toBe("string");
    });

    it("viewer URL includes bot query parameter", async () => {
      const { data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        { name: "@elizaos/app-2004scape" },
      );
      const viewer = asObject(asObject(data).viewer as JsonValue);
      const url = viewer.url as string;
      expect(url).toMatch(/[?&]bot=/);
    });

    it("viewer URL includes password param when credentials are set", async () => {
      const origName = process.env.RS_SDK_BOT_NAME;
      const origPassword = process.env.RS_SDK_BOT_PASSWORD;
      try {
        process.env.RS_SDK_BOT_NAME = "testuser";
        process.env.RS_SDK_BOT_PASSWORD = "testpass123";
        const { data } = await api(
          server.port,
          "POST",
          "/api/apps/launch",
          { name: "@elizaos/app-2004scape" },
        );
        const viewer = asObject(asObject(data).viewer as JsonValue);
        const url = viewer.url as string;
        expect(url).toContain("password=testpass123");
        expect(url).toContain("bot=testuser");
      } finally {
        if (origName !== undefined) {
          process.env.RS_SDK_BOT_NAME = origName;
        } else {
          delete process.env.RS_SDK_BOT_NAME;
        }
        if (origPassword !== undefined) {
          process.env.RS_SDK_BOT_PASSWORD = origPassword;
        } else {
          delete process.env.RS_SDK_BOT_PASSWORD;
        }
      }
    });

    it("RS_SDK_SERVER_URL env override is respected", async () => {
      const original = process.env.RS_SDK_SERVER_URL;
      try {
        process.env.RS_SDK_SERVER_URL = "https://custom-server.example.com";
        const { data } = await api(
          server.port,
          "POST",
          "/api/apps/launch",
          { name: "@elizaos/app-2004scape" },
        );
        const viewer = asObject(asObject(data).viewer as JsonValue);
        expect(viewer.url as string).toContain("custom-server.example.com");
      } finally {
        if (original !== undefined) {
          process.env.RS_SDK_SERVER_URL = original;
        } else {
          delete process.env.RS_SDK_SERVER_URL;
        }
      }
    });

    it("partial credentials: user-set name is preserved when password is auto-generated", async () => {
      const origName = process.env.RS_SDK_BOT_NAME;
      const origPassword = process.env.RS_SDK_BOT_PASSWORD;
      try {
        process.env.RS_SDK_BOT_NAME = "custombot";
        delete process.env.RS_SDK_BOT_PASSWORD;
        const { data } = await api(
          server.port,
          "POST",
          "/api/apps/launch",
          { name: "@elizaos/app-2004scape" },
        );
        const viewer = asObject(asObject(data).viewer as JsonValue);
        const authMsg = asObject(viewer.authMessage as JsonValue);
        expect(authMsg.authToken).toBe("custombot");
      } finally {
        if (origName !== undefined) {
          process.env.RS_SDK_BOT_NAME = origName;
        } else {
          delete process.env.RS_SDK_BOT_NAME;
        }
        if (origPassword !== undefined) {
          process.env.RS_SDK_BOT_PASSWORD = origPassword;
        } else {
          delete process.env.RS_SDK_BOT_PASSWORD;
        }
      }
    });
  });

  // ===================================================================
  //  11. Hyperscape postMessage auth integration
  // ===================================================================

  describe("Hyperscape postMessage auth", () => {
    it("launch includes postMessageAuth config when HYPERSCAPE_AUTH_TOKEN is set", async () => {
      // Save original env
      const originalToken = process.env.HYPERSCAPE_AUTH_TOKEN;

      // Set test token
      process.env.HYPERSCAPE_AUTH_TOKEN = "test-auth-token-e2e";

      try {
        const response = await api(server.port, "POST", "/api/apps/launch", {
          name: "@elizaos/app-hyperscape",
        });
        expect(response.status).toBe(200);
        const body = asObject(response.data);

        if (
          body.viewer &&
          typeof body.viewer === "object" &&
          !Array.isArray(body.viewer)
        ) {
          const viewer = body.viewer;
          expect(viewer.postMessageAuth).toBe(true);
          if (
            viewer.embedParams &&
            typeof viewer.embedParams === "object" &&
            !Array.isArray(viewer.embedParams)
          ) {
            expect(viewer.embedParams.mode).toBe("spectator");
            expect(viewer.embedParams.surface).toBe("agent-control");
          }

          if (
            viewer.authMessage &&
            typeof viewer.authMessage === "object" &&
            !Array.isArray(viewer.authMessage)
          ) {
            const authMsg = viewer.authMessage;
            expect(authMsg.type).toBe("HYPERSCAPE_AUTH");
            expect(authMsg.authToken).toBe("test-auth-token-e2e");
            if (typeof authMsg.agentId === "string") {
              expect(authMsg.agentId.length).toBeGreaterThan(0);
            }
          }
        }
        if (
          body.session &&
          typeof body.session === "object" &&
          !Array.isArray(body.session)
        ) {
          expect(body.session.mode).toBe("spectate-and-steer");
          expect(typeof body.session.sessionId).toBe("string");
        }
      } finally {
        // Restore original env
        if (originalToken !== undefined) {
          process.env.HYPERSCAPE_AUTH_TOKEN = originalToken;
        } else {
          delete process.env.HYPERSCAPE_AUTH_TOKEN;
        }
      }
    });

    it("launch disables postMessageAuth when HYPERSCAPE_AUTH_TOKEN is not set", async () => {
      // Save and clear token
      const originalToken = process.env.HYPERSCAPE_AUTH_TOKEN;
      delete process.env.HYPERSCAPE_AUTH_TOKEN;

      try {
        const response = await api(server.port, "POST", "/api/apps/launch", {
          name: "@elizaos/app-hyperscape",
        });
        expect(response.status).toBe(200);
        const body = asObject(response.data);

        if (
          body.viewer &&
          typeof body.viewer === "object" &&
          !Array.isArray(body.viewer)
        ) {
          const viewer = body.viewer;
          // postMessageAuth should be false when token is not configured
          expect(viewer.postMessageAuth).toBe(false);
          // authMessage should not be present
          expect(viewer.authMessage).toBeUndefined();
          if (
            viewer.embedParams &&
            typeof viewer.embedParams === "object" &&
            !Array.isArray(viewer.embedParams)
          ) {
            expect(viewer.embedParams.mode).toBe("spectator");
            expect(viewer.embedParams.surface).toBe("agent-control");
            expect(viewer.embedParams.followEntity).toBeUndefined();
          }
        }
        if (Array.isArray(body.diagnostics)) {
          expect(body.diagnostics).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code: "hyperscape-auth-unavailable",
                severity: "error",
              }),
            ]),
          );
        }
        if (
          body.session &&
          typeof body.session === "object" &&
          !Array.isArray(body.session)
        ) {
          expect(body.session.mode).toBe("spectate-and-steer");
          expect(typeof body.session.sessionId).toBe("string");
        }
      } finally {
        // Restore original env
        if (originalToken !== undefined) {
          process.env.HYPERSCAPE_AUTH_TOKEN = originalToken;
        }
      }
    });
  });
});
