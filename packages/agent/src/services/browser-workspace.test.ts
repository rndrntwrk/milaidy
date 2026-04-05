import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserWorkspaceUnavailableMessage,
  isBrowserWorkspaceBridgeConfigured,
  listBrowserWorkspaceTabs,
  openBrowserWorkspaceTab,
  resolveBrowserWorkspaceBridgeConfig,
} from "./browser-workspace";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("browser-workspace service", () => {
  it("detects when the desktop bridge is unavailable", () => {
    expect(
      resolveBrowserWorkspaceBridgeConfig({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      isBrowserWorkspaceBridgeConfigured({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("throws a clear error when no bridge config is present", async () => {
    await expect(
      listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv),
    ).rejects.toThrow(getBrowserWorkspaceUnavailableMessage());
  });

  it("sends bearer auth when opening a tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tab: {
          id: "btab_1",
          title: "Milady Browser",
          url: "https://example.com",
          partition: "persist:milady-browser",
          visible: false,
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
          lastFocusedAt: null,
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const tab = await openBrowserWorkspaceTab(
      { url: "https://example.com" },
      {
        MILADY_BROWSER_WORKSPACE_URL: "http://127.0.0.1:31340",
        MILADY_BROWSER_WORKSPACE_TOKEN: "secret",
      } as NodeJS.ProcessEnv,
    );

    expect(tab.id).toBe("btab_1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
  });
});
