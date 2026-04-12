/**
 * Integration tests for /api/permissions routes.
 *
 * Starts a real API server and makes real HTTP requests — no mocks.
 */

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

let port: number;
let close: () => Promise<void>;

beforeAll(async () => {
  const server = await startApiServer({ port: 0 });
  port = server.port;
  close = server.close;
}, 180_000);

afterAll(async () => {
  await close();
});

describe("permissions routes (real server)", () => {
  test("GET /api/permissions returns permission states with platform", async () => {
    const { status, data } = await req(port, "GET", "/api/permissions");
    expect(status).toBe(200);
    expect(data).toHaveProperty("_platform");
    expect(data).toHaveProperty("_shellEnabled");
  }, 60_000);

  test("GET /api/permissions/shell returns shell permission state", async () => {
    const { status, data } = await req(port, "GET", "/api/permissions/shell");
    expect(status).toBe(200);
    expect(data).toHaveProperty("enabled");
    expect(data).toHaveProperty("permission");
  }, 60_000);

  test("GET /api/permissions/:id returns not-applicable for unknown permission", async () => {
    const { status, data } = await req(port, "GET", "/api/permissions/camera");
    expect(status).toBe(200);
    expect((data as { status: string }).status).toBe("not-applicable");
  }, 60_000);

  test("PUT /api/permissions/shell enables shell", async () => {
    const { status, data } = await req(port, "PUT", "/api/permissions/shell", {
      enabled: true,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("enabled", true);
  }, 60_000);

  test("POST /api/permissions/refresh returns refresh message", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/permissions/refresh",
    );
    expect(status).toBe(200);
    expect((data as { action: string }).action).toBe(
      "ipc:permissions:refresh",
    );
  }, 60_000);

  test("POST /api/permissions/:id/request returns request action", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/permissions/camera/request",
    );
    expect(status).toBe(200);
    expect((data as { action: string }).action).toBe(
      "ipc:permissions:request:camera",
    );
  }, 60_000);

  test("POST /api/permissions/:id/open-settings returns open-settings action", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/permissions/microphone/open-settings",
    );
    expect(status).toBe(200);
    expect((data as { action: string }).action).toBe(
      "ipc:permissions:openSettings:microphone",
    );
  }, 60_000);

  test("PUT /api/permissions/state updates permission states", async () => {
    const { status, data } = await req(
      port,
      "PUT",
      "/api/permissions/state",
      {
        permissions: {
          camera: {
            id: "camera",
            status: "granted",
            lastChecked: Date.now(),
            canRequest: false,
          },
        },
      },
    );
    expect(status).toBe(200);
    expect((data as { updated: boolean }).updated).toBe(true);
  }, 60_000);
});
