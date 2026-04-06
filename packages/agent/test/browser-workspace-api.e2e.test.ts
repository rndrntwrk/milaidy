import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { manageMiladyBrowserWorkspaceAction } from "../../../plugins/plugin-milady-browser/src/action";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";
import {
  type BrowserWorkspaceTab,
  closeBrowserWorkspaceTab,
  listBrowserWorkspaceTabs,
} from "../src/services/browser-workspace";

type LocalSiteFixture = {
  counterUrl: string;
  tasksUrl: string;
  close: () => Promise<void>;
};

type BrowserWorkspaceSnapshotPayload = {
  mode?: string;
  tabs?: BrowserWorkspaceTab[];
};

function inferLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "") || "Milady Browser";
}

async function startLocalSiteFixture(): Promise<LocalSiteFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const html =
      url.pathname === "/tasks"
        ? `<!doctype html>
            <html lang="en">
              <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
              <body><h1>Tasks Fixture</h1><p>Agent task board</p></body>
            </html>`
        : `<!doctype html>
            <html lang="en">
              <head><meta charset="utf-8" /><title>Counter Fixture</title></head>
              <body><h1>Counter Fixture</h1><p>Agent browser workspace test page</p></body>
            </html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const primaryBase = `http://127.0.0.1:${address.port}`;

  return {
    counterUrl: `${primaryBase}/counter`,
    tasksUrl: `${primaryBase}/tasks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function readSnapshot(
  data: Record<string, unknown>,
): BrowserWorkspaceSnapshotPayload {
  return {
    mode: typeof data.mode === "string" ? data.mode : undefined,
    tabs: Array.isArray(data.tabs) ? (data.tabs as BrowserWorkspaceTab[]) : [],
  };
}

describe("Browser workspace API E2E", () => {
  let apiServer: { port: number; close: () => Promise<void> };
  let siteFixture: LocalSiteFixture;

  beforeAll(async () => {
    siteFixture = await startLocalSiteFixture();
    apiServer = await startApiServer({ port: 0 });
  }, 30_000);

  beforeEach(async () => {
    const tabs = await listBrowserWorkspaceTabs();
    await Promise.all(tabs.map((tab) => closeBrowserWorkspaceTab(tab.id)));
  });

  afterAll(async () => {
    await apiServer.close();
    await siteFixture.close();
  });

  it("opens, shows, navigates, and closes tabs through the real browser workspace API", async () => {
    const openFirst = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/tabs",
      {
        show: true,
        title: "Counter Fixture",
        url: siteFixture.counterUrl,
      },
    );
    expect(openFirst.status).toBe(200);

    const firstTab = openFirst.data.tab as BrowserWorkspaceTab;
    expect(firstTab.url).toBe(siteFixture.counterUrl);
    expect(firstTab.visible).toBe(true);

    const openSecond = await req(
      apiServer.port,
      "POST",
      "/api/browser-workspace/tabs",
      {
        show: false,
        title: "Tasks Fixture",
        url: siteFixture.tasksUrl,
      },
    );
    expect(openSecond.status).toBe(200);

    const secondTab = openSecond.data.tab as BrowserWorkspaceTab;
    expect(secondTab.visible).toBe(false);

    const initialSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(initialSnapshot.mode).toBe("web");
    expect(initialSnapshot.tabs).toHaveLength(2);
    expect(initialSnapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
    expect(initialSnapshot.tabs?.[1]?.url).toBe(siteFixture.tasksUrl);

    const showSecond = await req(
      apiServer.port,
      "POST",
      `/api/browser-workspace/tabs/${encodeURIComponent(secondTab.id)}/show`,
    );
    expect(showSecond.status).toBe(200);
    expect((showSecond.data.tab as BrowserWorkspaceTab).visible).toBe(true);

    const navigateSecond = await req(
      apiServer.port,
      "POST",
      `/api/browser-workspace/tabs/${encodeURIComponent(secondTab.id)}/navigate`,
      { url: siteFixture.counterUrl },
    );
    expect(navigateSecond.status).toBe(200);
    expect((navigateSecond.data.tab as BrowserWorkspaceTab).url).toBe(
      siteFixture.counterUrl,
    );

    const afterShowSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(
      afterShowSnapshot.tabs?.find((tab) => tab.id === firstTab.id)?.visible,
    ).toBe(false);
    expect(
      afterShowSnapshot.tabs?.find((tab) => tab.id === secondTab.id)?.visible,
    ).toBe(true);

    const closeFirst = await req(
      apiServer.port,
      "DELETE",
      `/api/browser-workspace/tabs/${encodeURIComponent(firstTab.id)}`,
    );
    expect(closeFirst.status).toBe(200);
    expect(closeFirst.data.closed).toBe(true);

    const finalSnapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(finalSnapshot.tabs).toHaveLength(1);
    expect(finalSnapshot.tabs?.[0]?.id).toBe(secondTab.id);
    expect(finalSnapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
  });

  it("shares browser workspace state between the plugin action and the real API routes", async () => {
    const callback = vi.fn();

    const openResult = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: `Open ${siteFixture.counterUrl} in the browser workspace`,
        },
      } as never,
      undefined,
      {
        parameters: {
          show: true,
        },
      },
      callback,
    );

    expect(openResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Opened visible browser tab"),
    });

    const snapshot = readSnapshot(
      (await req(apiServer.port, "GET", "/api/browser-workspace")).data,
    );
    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.tabs?.[0]?.url).toBe(siteFixture.counterUrl);
    expect(snapshot.tabs?.[0]?.title).toBe(inferLabel(siteFixture.counterUrl));

    const listResult = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "List browser tabs",
        },
      } as never,
      undefined,
      undefined,
      vi.fn(),
    );

    expect(listResult).toMatchObject({
      success: true,
      text: expect.stringContaining(siteFixture.counterUrl),
    });
  });
});
