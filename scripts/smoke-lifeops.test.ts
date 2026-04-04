import { describe, expect, it, vi } from "vitest";
import {
  resolveLifeOpsAuthHeaders,
  resolveLifeOpsBaseUrls,
  runSmokeLifeOps,
} from "./smoke-lifeops.mjs";

describe("smoke-lifeops script", () => {
  it("prefers explicit argv base URLs over env", () => {
    expect(
      resolveLifeOpsBaseUrls(["https://argv.example"], {
        MILADY_LIFEOPS_BASE_URLS: "https://env.example",
      }),
    ).toEqual(["https://argv.example"]);
  });

  it("adds a bearer token header when a smoke token is configured", () => {
    expect(
      resolveLifeOpsAuthHeaders({
        MILADY_SMOKE_API_TOKEN: "secret-token",
      }),
    ).toEqual({
      Accept: "application/json",
      Authorization: "Bearer secret-token",
    });
  });

  it("fails when no base URLs are configured", async () => {
    const error = vi.fn();

    const exitCode = await runSmokeLifeOps({
      argv: [],
      env: {},
      fetchImpl: vi.fn(),
      error,
      log: vi.fn(),
    });

    expect(exitCode).toBe(2);
    expect(error).toHaveBeenCalledWith(
      "[smoke-lifeops] Missing base URLs. Pass args or set MILADY_LIFEOPS_BASE_URLS.",
    );
  });

  it("checks overview, browser sessions, and Google status with auth", async () => {
    const fetchImpl = vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        Authorization: "Bearer smoke-token",
      });
      if (url.endsWith("/api/lifeops/overview")) {
        return new Response(
          JSON.stringify({
            summary: {
              activeOccurrenceCount: 2,
              activeReminderCount: 1,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/lifeops/browser/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/lifeops/connectors/google/status")) {
        return new Response(
          JSON.stringify({
            provider: "google",
            connected: false,
            reason: "disconnected",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const exitCode = await runSmokeLifeOps({
      argv: ["https://milady.example"],
      env: {
        MILADY_SMOKE_API_TOKEN: "smoke-token",
      },
      fetchImpl,
      error: vi.fn(),
      log: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails when Google connectivity is required but disconnected", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/lifeops/overview")) {
        return new Response(
          JSON.stringify({
            summary: {
              activeOccurrenceCount: 0,
              activeReminderCount: 0,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/lifeops/browser/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/lifeops/connectors/google/status")) {
        return new Response(
          JSON.stringify({
            provider: "google",
            connected: false,
            reason: "needs_reauth",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const error = vi.fn();

    const exitCode = await runSmokeLifeOps({
      argv: ["https://milady.example"],
      env: {
        MILADY_LIFEOPS_EXPECT_GOOGLE_CONNECTED: "true",
      },
      fetchImpl,
      error,
      log: vi.fn(),
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "[smoke-lifeops] FAIL https://milady.example/api/lifeops/connectors/google/status expected an active Google connection.",
    );
  });
});
