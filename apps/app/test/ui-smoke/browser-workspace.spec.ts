import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, type Route, test } from "@playwright/test";
import { installDefaultAppMocks, openAppPath, seedAppStorage } from "./helpers";

type BrowserWorkspaceTab = {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
};

type BrowserWorkspaceState = {
  nextId: number;
  tabs: BrowserWorkspaceTab[];
  transferRequests: Array<Record<string, unknown>>;
};

type BrowserWorkspaceFixture = {
  counterUrl: string;
  tasksUrl: string;
  close: () => Promise<void>;
};

const DEFAULT_PARTITION = "persist:milady-browser";
const LOCAL_WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const LOCAL_TRANSFER_HASH = "0xplaywrighttransfer";

function now(): string {
  return new Date().toISOString();
}

function inferTitle(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "") || "Milady Browser";
}

function createTab(
  state: BrowserWorkspaceState,
  url: string,
  visible: boolean,
  title?: string,
): BrowserWorkspaceTab {
  const timestamp = now();
  return {
    id: `btab_${state.nextId++}`,
    title: title?.trim() || inferTitle(url),
    url,
    partition: DEFAULT_PARTITION,
    visible,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastFocusedAt: visible ? timestamp : null,
  };
}

async function fulfillJson(
  route: Route,
  payload: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function readRequestJson<T>(route: Route): T {
  const raw = route.request().postData() ?? "{}";
  return JSON.parse(raw) as T;
}

async function installBrowserWorkspaceMocks(
  page: Page,
  state: BrowserWorkspaceState,
): Promise<void> {
  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/navigate$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/navigate")[0] ?? "",
      );
      const payload = readRequestJson<{ url?: string }>(route);
      const nextUrl = payload.url?.trim() || "about:blank";
      const timestamp = now();

      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: inferTitle(nextUrl),
              updatedAt: timestamp,
              url: nextUrl,
            }
          : tab,
      );

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/show$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/show")[0] ?? "",
      );
      const timestamp = now();
      state.tabs = state.tabs.map((tab) => ({
        ...tab,
        visible: tab.id === tabId,
        lastFocusedAt: tab.id === tabId ? timestamp : tab.lastFocusedAt,
      }));

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/hide$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/hide")[0] ?? "",
      );
      const timestamp = now();
      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              updatedAt: timestamp,
              visible: false,
            }
          : tab,
      );

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(/\/api\/browser-workspace\/tabs\/[^/]+$/, async (route) => {
    const request = route.request();
    if (request.method() !== "DELETE") {
      await route.fallback();
      return;
    }
    const tabId = decodeURIComponent(
      request.url().split("/tabs/")[1]?.split("?")[0] ?? "",
    );
    const previousLength = state.tabs.length;
    state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
    await fulfillJson(route, { closed: state.tabs.length !== previousLength });
  });

  await page.route("**/api/browser-workspace/tabs", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const payload = readRequestJson<{
      show?: boolean;
      title?: string;
      url?: string;
    }>(route);
    const nextUrl = payload.url?.trim() || "about:blank";
    const tab = createTab(state, nextUrl, payload.show === true, payload.title);

    if (tab.visible) {
      state.tabs = state.tabs.map((entry) => ({
        ...entry,
        visible: false,
      }));
    }
    state.tabs = [...state.tabs, tab];

    await fulfillJson(route, { tab });
  });

  await page.route("**/api/browser-workspace", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      mode: "web",
      tabs: state.tabs,
    });
  });
}

async function installWalletMocks(
  page: Page,
  state: BrowserWorkspaceState,
  options: { localReady: boolean },
): Promise<void> {
  const walletConfig = options.localReady
    ? {
        selectedRpcProviders: {
          evm: "eliza-cloud",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
        walletNetwork: "mainnet",
        legacyCustomChains: [],
        alchemyKeySet: false,
        infuraKeySet: false,
        ankrKeySet: false,
        heliusKeySet: false,
        birdeyeKeySet: false,
        evmChains: [
          "Ethereum",
          "Base",
          "Arbitrum",
          "Optimism",
          "Polygon",
          "BSC",
          "Avalanche",
        ],
        evmAddress: LOCAL_WALLET_ADDRESS,
        solanaAddress: null,
        walletSource: "local",
        automationMode: "full",
        pluginEvmLoaded: true,
        pluginEvmRequired: true,
        executionReady: true,
        executionBlockedReason: null,
      }
    : {
        selectedRpcProviders: {
          evm: "eliza-cloud",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
        walletNetwork: "mainnet",
        legacyCustomChains: [],
        alchemyKeySet: false,
        infuraKeySet: false,
        ankrKeySet: false,
        heliusKeySet: false,
        birdeyeKeySet: false,
        evmChains: [],
        evmAddress: null,
        solanaAddress: null,
        walletSource: "none",
        automationMode: "full",
        pluginEvmLoaded: false,
        pluginEvmRequired: false,
        executionReady: false,
        executionBlockedReason: "No EVM wallet is active yet.",
      };

  await page.route("**/api/wallet/addresses", async (route) => {
    await fulfillJson(route, {
      evmAddress: options.localReady ? LOCAL_WALLET_ADDRESS : null,
      solanaAddress: null,
    });
  });

  await page.route("**/api/wallet/config", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(route, walletConfig);
  });

  await page.route("**/api/wallet/steward-status", async (route) => {
    await fulfillJson(route, {
      configured: false,
      available: false,
      connected: false,
      walletAddresses: {
        evm: options.localReady ? LOCAL_WALLET_ADDRESS : null,
        solana: null,
      },
      error: null,
    });
  });

  await page.route("**/api/wallet/steward-pending-approvals", async (route) => {
    await fulfillJson(route, []);
  });

  await page.route("**/api/wallet/transfer/execute", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const payload = readRequestJson<Record<string, unknown>>(route);
    state.transferRequests.push(payload);
    await fulfillJson(route, {
      ok: true,
      mode: "local-key",
      executed: true,
      requiresUserSignature: false,
      toAddress: payload.toAddress,
      amount: payload.amount,
      assetSymbol: payload.assetSymbol,
      unsignedTx: {
        chainId: 56,
        from: LOCAL_WALLET_ADDRESS,
        to: payload.toAddress,
        data: "0x",
        valueWei: "0",
        explorerUrl: "https://bscscan.com",
        assetSymbol: payload.assetSymbol,
        amount: payload.amount,
      },
      execution: {
        hash: LOCAL_TRANSFER_HASH,
        nonce: 12,
        gasLimit: "21000",
        valueWei: "0",
        explorerUrl: `https://bscscan.com/tx/${LOCAL_TRANSFER_HASH}`,
        blockNumber: null,
        status: "pending",
      },
    });
  });
}

async function startBrowserWorkspaceFixture(): Promise<BrowserWorkspaceFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/tasks") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
          <body>
            <h1>Tasks Fixture</h1>
            <p id="tasks-state">0 completed</p>
            <label>
              <input
                id="task-one"
                type="checkbox"
                onchange="document.getElementById('tasks-state').textContent = this.checked ? '1 completed' : '0 completed'"
              />
              Finish browser workspace smoke task
            </label>
          </body>
        </html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Counter Fixture</title></head>
        <body>
          <h1>Counter Fixture</h1>
          <p>Persistent counter state for the browser workspace smoke test.</p>
          <div id="count">0</div>
          <button
            id="increment"
            type="button"
            onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent || '0') + 1)"
          >
            Increment
          </button>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const primaryBase = `http://127.0.0.1:${address.port}`;
  const secondaryBase = `http://localhost:${address.port}`;

  return {
    counterUrl: `${primaryBase}/counter`,
    tasksUrl: `${secondaryBase}/tasks`,
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

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page);
  await seedAppStorage(page);
});

test("browser workspace keeps live website tabs mounted while switching between them", async ({
  page,
}) => {
  const fixture = await startBrowserWorkspaceFixture();
  const state: BrowserWorkspaceState = {
    nextId: 1,
    tabs: [],
    transferRequests: [],
  };

  try {
    await installBrowserWorkspaceMocks(page, state);
    await installWalletMocks(page, state, { localReady: false });

    await openAppPath(page, "/browser");
    await expect(page.getByText("No browser tabs yet")).toBeVisible();

    await page.getByPlaceholder("Enter a URL").fill(fixture.counterUrl);
    await page.getByRole("button", { name: "Open", exact: true }).click();

    const counterFrame = page.frameLocator('iframe[title="127.0.0.1"]');
    await expect(
      counterFrame.getByRole("heading", { name: "Counter Fixture" }),
    ).toBeVisible();
    await counterFrame.getByRole("button", { name: "Increment" }).click();
    await expect(counterFrame.locator("#count")).toHaveText("1");

    await page.getByPlaceholder("Enter a URL").fill(fixture.tasksUrl);
    await page.getByRole("button", { name: "New tab" }).first().click();

    const tasksFrame = page.frameLocator('iframe[title="localhost"]');
    await expect(
      tasksFrame.getByRole("heading", { name: "Tasks Fixture" }),
    ).toBeVisible();
    await tasksFrame.locator("#task-one").check();
    await expect(tasksFrame.locator("#tasks-state")).toHaveText("1 completed");
    await expect(page.locator("iframe")).toHaveCount(2);

    await page.getByRole("button", { name: "127.0.0.1" }).first().click();
    await expect(counterFrame.locator("#count")).toHaveText("1");
    await page.getByRole("button", { name: "localhost" }).first().click();
    await expect(tasksFrame.locator("#tasks-state")).toHaveText("1 completed");
  } finally {
    await fixture.close();
  }
});

test("browser workspace can submit local wallet transfers when Steward is unavailable", async ({
  page,
}) => {
  const state: BrowserWorkspaceState = {
    nextId: 1,
    tabs: [],
    transferRequests: [],
  };

  await installBrowserWorkspaceMocks(page, state);
  await installWalletMocks(page, state, { localReady: true });

  await openAppPath(page, "/browser");

  await expect(page.getByText("Local wallet ready")).toBeVisible();
  await page
    .locator("#browser-workspace-wallet-to")
    .fill("0xabc0000000000000000000000000000000000000");
  await page.locator("#browser-workspace-wallet-amount").fill("0.25");
  await page.locator("#browser-workspace-wallet-asset").fill("BNB");
  await page.getByTestId("browser-workspace-sign-submit").click();

  await expect(
    page
      .getByTestId("browser-workspace-wallet-panel")
      .getByText(`Submitted BNB transfer on BSC: ${LOCAL_TRANSFER_HASH}.`),
  ).toBeVisible();
  expect(state.transferRequests).toEqual([
    {
      amount: "0.25",
      assetSymbol: "BNB",
      confirm: true,
      toAddress: "0xabc0000000000000000000000000000000000000",
    },
  ]);
});
