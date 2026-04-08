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
	            <label>
	              Plan
	              <select name="plan">
	                <option value="basic">Basic</option>
	                <option value="pro">Pro</option>
	              </select>
	            </label>
	            <label>
	              <input type="checkbox" name="terms" value="yes" />
	              Accept terms
	            </label>
	            <button type="submit">Continue</button>
	            <button type="button" data-testid="secondary-action">Secondary</button>
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

    expect(tab.id).toMatch(/^btab_\d+$/);

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
      tabs: [{ id: tab.id, visible: true }],
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

  it("supports semantic find, select, check, snapshot, and richer get modes", async () => {
    await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );

    const fillName = await executeBrowserWorkspaceCommand(
      {
        subaction: "find",
        findBy: "label",
        action: "fill",
        text: "Agent name",
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fillName.value).toEqual(
      expect.objectContaining({ value: "Milady" }),
    );

    const selectPlan = await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        findBy: "label",
        text: "Plan",
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(selectPlan.value).toEqual(
      expect.objectContaining({ value: "pro" }),
    );

    const checkTerms = await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        findBy: "label",
        text: "Accept terms",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(checkTerms.value).toEqual(
      expect.objectContaining({ checked: true }),
    );

    const snapshot = await executeBrowserWorkspaceCommand(
      {
        subaction: "snapshot",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: "input[name=\"name\"]" }),
        expect.objectContaining({ selector: "select[name=\"plan\"]" }),
      ]),
    );

    const styles = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        findBy: "testid",
        text: "secondary-action",
        getMode: "styles",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(styles.value).toEqual(
      expect.objectContaining({ display: expect.any(String) }),
    );

    const checked = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        findBy: "label",
        text: "Accept terms",
        getMode: "checked",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(checked.value).toBe(true);
  });

  it("accepts semantic selector shorthand that real browser planners commonly emit", async () => {
    await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );

    const fill = await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        selector: "label=Agent name",
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(fill.value).toEqual(expect.objectContaining({ value: "Milady" }));

    const select = await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        selector: "label=Plan",
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(select.value).toEqual(expect.objectContaining({ value: "pro" }));

    const check = await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        selector: "label=Accept terms",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(check.value).toEqual(expect.objectContaining({ checked: true }));

    const click = await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        selector: 'role=button[name="Continue"]',
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(click.tab?.url).toContain("/welcome");

    const heading = await executeBrowserWorkspaceCommand(
      {
        subaction: "get",
        selector: "text=Welcome, Milady",
        getMode: "text",
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(heading.value).toBe("Welcome, Milady");
  });

  it("supports agent-browser-style snapshot refs for follow-up browser commands", async () => {
    await executeBrowserWorkspaceCommand(
      {
        subaction: "open",
        show: true,
        url: fixture.formUrl,
      },
      {} as NodeJS.ProcessEnv,
    );

    const snapshot = await executeBrowserWorkspaceCommand(
      {
        subaction: "snapshot",
      },
      {} as NodeJS.ProcessEnv,
    );

    const nameRef = snapshot.elements?.find((element) =>
      element.selector.includes('input[name="name"]'),
    )?.ref;
    const planRef = snapshot.elements?.find((element) =>
      element.selector.includes('select[name="plan"]'),
    )?.ref;
    const termsRef = snapshot.elements?.find(
      (element) =>
        element.type === "checkbox" ||
        element.selector.includes('input[name="terms"]'),
    )?.ref;
    const continueRef = snapshot.elements?.find((element) =>
      element.selector.includes('button[type="submit"]'),
    )?.ref;

    expect(nameRef).toMatch(/^@e\d+$/);
    expect(planRef).toMatch(/^@e\d+$/);
    expect(termsRef).toMatch(/^@e\d+$/);
    expect(continueRef).toMatch(/^@e\d+$/);

    await executeBrowserWorkspaceCommand(
      {
        subaction: "fill",
        selector: nameRef,
        value: "Milady",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "select",
        selector: planRef,
        value: "pro",
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "check",
        selector: termsRef,
      },
      {} as NodeJS.ProcessEnv,
    );
    await executeBrowserWorkspaceCommand(
      {
        subaction: "click",
        selector: continueRef,
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

  it("supports timed waits without a selector condition", async () => {
    const startedAt = Date.now();
    const wait = await executeBrowserWorkspaceCommand(
      {
        subaction: "wait",
        timeoutMs: 30,
      },
      {} as NodeJS.ProcessEnv,
    );

    expect(wait.value).toEqual({ waitedMs: 30 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
  });
});
