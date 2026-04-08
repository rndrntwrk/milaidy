import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeBrowserWorkspaceTab,
  executeBrowserWorkspaceCommand,
  evaluateBrowserWorkspaceTab,
  getBrowserWorkspaceMode,
  getBrowserWorkspaceSnapshot,
  isBrowserWorkspaceBridgeConfigured,
  listBrowserWorkspaceTabs,
  openBrowserWorkspaceTab,
  resolveBrowserWorkspaceBridgeConfig,
} from "./browser-workspace";

const originalFetch = globalThis.fetch;

type BrowserFixture = {
  formUrl: string;
  tasksUrl: string;
  close: () => Promise<void>;
};

async function startBrowserFixture(): Promise<BrowserFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/tasks") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
          <body>
            <h1>Tasks Fixture</h1>
            <p>Agent task board</p>
          </body>
        </html>`);
      return;
    }

    if (url.pathname === "/welcome") {
      const name = url.searchParams.get("name") || "Anonymous";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Welcome Fixture</title></head>
          <body>
            <h1>Welcome, ${name}</h1>
            <a href="/tasks">Open tasks</a>
          </body>
        </html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Browser Form Fixture</title></head>
        <body>
          <h1>Browser Form Fixture</h1>
          <form action="/welcome" method="get">
            <label>
              Agent name
              <input name="name" value="" />
            </label>
            <button type="submit">Continue</button>
          </form>
          <a href="/tasks">Open tasks</a>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    formUrl: `${baseUrl}/form`,
    tasksUrl: `${baseUrl}/tasks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

describe("browser-workspace service", () => {
  let fixture: BrowserFixture;

  beforeAll(async () => {
    fixture = await startBrowserFixture();
  });

  beforeEach(async () => {
    const tabs = await listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv);
    await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id, {} as NodeJS.ProcessEnv)));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fixture.close();
  });

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
    expect(getBrowserWorkspaceMode({} as NodeJS.ProcessEnv)).toBe("web");
  });

  it("falls back to an in-process web workspace when no bridge config is present", async () => {
    expect(await listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv)).toEqual([]);

    const tab = await openBrowserWorkspaceTab(
      { show: true, url: "about:blank" },
      {} as NodeJS.ProcessEnv,
    );

    expect(tab.id).toBe("btab_1");

    await expect(
      evaluateBrowserWorkspaceTab(
        { id: tab.id, script: "document.title" },
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow(
      "Milady browser workspace eval is only available in the desktop app.",
    );

    await expect(
      getBrowserWorkspaceSnapshot({} as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      mode: "web",
      tabs: [{ id: "btab_1", visible: true }],
    });
  });

  it("serialises concurrent web-mode tab mutations without corruption", async () => {
    const env = {} as NodeJS.ProcessEnv;

    const opens = Array.from({ length: 10 }, (_, i) =>
      openBrowserWorkspaceTab(
        { show: false, url: `http://127.0.0.1:9999/${i}` },
        env,
      ),
    );
    const tabs = await Promise.all(opens);

    const ids = new Set(tabs.map((t) => t.id));
    expect(ids.size).toBe(10);

    const snapshot = await getBrowserWorkspaceSnapshot(env);
    for (const tab of tabs) {
      expect(snapshot.tabs.some((t) => t.id === tab.id)).toBe(true);
    }
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

    const tab = await openBrowserWorkspaceTab({ url: "https://example.com" }, {
      MILADY_BROWSER_WORKSPACE_URL: "http://127.0.0.1:31340",
      MILADY_BROWSER_WORKSPACE_TOKEN: "secret",
    } as NodeJS.ProcessEnv);

    expect(tab.id).toBe("btab_1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
  });

  it("executes real browser subactions in web mode against fixture pages", async () => {
    const open = await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(open.tab?.url).toBe(fixture.formUrl);

    const inspect = await executeBrowserWorkspaceCommand(
      {
        subaction: "inspect",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(inspect.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "input[name=\"name\"]" }),
        expect.objectContaining({ selector: "button[type=\"submit\"]" }),
      ]),
    );

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        selector: "input[name=\"name\"]",
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        selector: "button[type=\"submit\"]",
      },
      {} as NodeJS.ProcessEnv,
    );
    const heading = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        selector: "h1",
        getMode: "text",
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(heading.value).toBe("Welcome, Milady");
  });

  it("runs batch subactions against the current visible tab", async () => {
    const result = await executeBrowserWorkspaceCommand(
      {
        subaction: "batch",
        steps: [
          {
            subaction: "open",
            show: true,
            url: fixture.formUrl,
          },
          {
            subaction: "fill",
            selector: "input[name=\"name\"]",
            value: "BrowserAgent",
          },
          {
            subaction: "click",
            selector: "button[type=\"submit\"]",
          },
          {
            subaction: "get",
            selector: "h1",
            getMode: "text",
          },
        ],
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(result.subaction).toBe("batch");
    expect(result.steps).toHaveLength(4);
    expect(result.value).toBe("Welcome, BrowserAgent");
  });
});
