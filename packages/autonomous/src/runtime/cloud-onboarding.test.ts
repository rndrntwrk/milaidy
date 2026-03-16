/**
 * Tests for cloud-onboarding.ts
 *
 * Mocks fetch and the cloud modules to verify the orchestration logic
 * without requiring a live Eliza Cloud instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCloudAvailability } from "./cloud-onboarding";

// ---------------------------------------------------------------------------
// checkCloudAvailability
// ---------------------------------------------------------------------------

describe("checkCloudAvailability", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null when cloud is accepting new agents", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { acceptingNewAgents: true, availableSlots: 5 },
      }),
    }) as unknown as typeof fetch;

    const result = await checkCloudAvailability("https://www.elizacloud.ai");
    expect(result).toBeNull();
  });

  it("returns error message when cloud is at capacity", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { acceptingNewAgents: false, availableSlots: 0 },
      }),
    }) as unknown as typeof fetch;

    const result = await checkCloudAvailability("https://www.elizacloud.ai");
    expect(result).toContain("at capacity");
  });

  it("returns error message when cloud returns HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const result = await checkCloudAvailability("https://www.elizacloud.ai");
    expect(result).toContain("503");
  });

  it("returns error message when fetch throws (network error)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const result = await checkCloudAvailability("https://www.elizacloud.ai");
    expect(result).toContain("ECONNREFUSED");
  });

  it("returns timeout message on timeout", async () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(err) as unknown as typeof fetch;

    const result = await checkCloudAvailability("https://www.elizacloud.ai");
    expect(result).toContain("timed out");
  });

  it("normalises the base URL before fetching", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { acceptingNewAgents: true, availableSlots: 1 },
      }),
    }) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    await checkCloudAvailability("https://elizacloud.ai/api/v1/");

    // normalizeCloudSiteUrl should strip the /api/v1 and add www
    const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain("www.elizacloud.ai");
    expect(calledUrl).toContain("/api/compat/availability");
    expect(calledUrl).not.toContain("/api/v1/api/compat");
  });
});
