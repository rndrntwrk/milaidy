import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../security/access.js", () => ({
  hasOwnerAccess: vi.fn(),
}));

import { createUserNameProvider } from "./user-name.js";
import { hasOwnerAccess } from "../security/access.js";

function mockFetchJson(payload: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => payload,
    })),
  );
}

describe("userName provider", () => {
  const provider = createUserNameProvider();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hasOwnerAccess).mockResolvedValue(true);
  });

  it("returns the stored owner name in app chat", async () => {
    mockFetchJson({ ui: { ownerName: "Shaw" } });

    const result = await provider.get(
      {} as never,
      { content: { source: "client_chat" }, entityId: "owner-1" } as never,
      {} as never,
    );

    expect(result).toMatchObject({
      text: "The user's name is Shaw.",
      values: { userName: "Shaw" },
    });
  });

  it("falls back to admin when no preferred name is stored", async () => {
    mockFetchJson({});

    const result = await provider.get(
      {} as never,
      { content: { source: "client_chat" }, entityId: "owner-1" } as never,
      {} as never,
    );

    expect(result.text).toContain("fallback label is admin");
    expect(result.values).toMatchObject({
      userName: "admin",
      userNameFallback: true,
    });
  });

  it("stays silent outside owner app-chat contexts", async () => {
    mockFetchJson({ ui: { ownerName: "Shaw" } });
    vi.mocked(hasOwnerAccess).mockResolvedValue(false);

    const result = await provider.get(
      {} as never,
      { content: { source: "telegram" }, entityId: "guest-1" } as never,
      {} as never,
    );

    expect(result).toEqual({ text: "" });
  });
});
