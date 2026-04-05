// @vitest-environment jsdom

import type { StewardPendingApproval } from "@miladyai/shared/contracts/wallet";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInlineUiMock } from "./mockInlineUi";

const {
  mockClient,
  mockCopyToClipboard,
  mockExecuteBscTransfer,
  mockOpenExternalUrl,
  mockSetActionNotice,
  mockUseApp,
} = vi.hoisted(() => ({
  mockClient: {
    closeBrowserWorkspaceTab: vi.fn(),
    getBrowserWorkspace: vi.fn(),
    getWalletConfig: vi.fn(),
    navigateBrowserWorkspaceTab: vi.fn(),
    openBrowserWorkspaceTab: vi.fn(),
    showBrowserWorkspaceTab: vi.fn(),
    signViaSteward: vi.fn(),
  },
  mockCopyToClipboard: vi.fn(async () => {}),
  mockExecuteBscTransfer: vi.fn(),
  mockOpenExternalUrl: vi.fn(async () => {}),
  mockSetActionNotice: vi.fn(),
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");
  const inline = createInlineUiMock(actual);
  return {
    ...inline,
    PageLayout: ({
      children,
      contentHeader,
      contentRef,
      sidebar,
      ...props
    }: React.PropsWithChildren<{
      contentHeader?: React.ReactNode;
      contentRef?: React.Ref<HTMLElement>;
      sidebar?: React.ReactNode;
    }>) =>
      React.createElement(
        "div",
        props,
        sidebar,
        contentHeader,
        React.createElement("main", { ref: contentRef }, children),
      ),
  };
});

vi.mock("../../src/state", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/state")>("../../src/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/api")>("../../src/api");
  return {
    ...actual,
    client: mockClient,
  };
});

vi.mock("../../src/utils", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/utils")>("../../src/utils");
  return {
    ...actual,
    openExternalUrl: mockOpenExternalUrl,
  };
});

vi.mock("../../src/components/steward/StewardLogo", () => ({
  StewardLogo: () =>
    React.createElement(
      "div",
      { "data-testid": "steward-logo" },
      "StewardLogo",
    ),
}));

import { BrowserWorkspaceView } from "../../src/components/pages/BrowserWorkspaceView";

interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
}

interface WorkspaceState {
  mode: "web";
  tabs: BrowserTabState[];
}

const FIXED_TIMESTAMP = "2026-04-05T18:45:00.000Z";
const FIXED_WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const FIXED_LOCAL_TX_HASH = "0xlocaltransfer1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTab(id: string, url: string, visible = false): BrowserTabState {
  return {
    id,
    title: new URL(url).hostname,
    url,
    partition: "persist:milady-browser",
    visible,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    lastFocusedAt: visible ? FIXED_TIMESTAMP : null,
  };
}

function createPendingApproval(
  txId: string,
  to: string,
  value: string,
  chainId: number,
): StewardPendingApproval {
  return {
    queueId: `queue:${txId}`,
    requestedAt: FIXED_TIMESTAMP,
    status: "pending",
    transaction: {
      agentId: "agent-browser",
      createdAt: FIXED_TIMESTAMP,
      id: txId,
      policyResults: [],
      request: {
        agentId: "agent-browser",
        tenantId: "tenant-browser",
        to,
        value,
        chainId,
      },
      status: "pending",
    },
  };
}

describe("Browser workspace wallet integration", () => {
  let workspace: WorkspaceState;
  let pendingApprovals: StewardPendingApproval[];
  let tabCounter: number;
  let signatureCounter: number;
  let approveStewardTx: ReturnType<typeof vi.fn>;
  let executeBscTransfer: ReturnType<typeof vi.fn>;
  let getStewardPending: ReturnType<typeof vi.fn>;
  let getStewardStatus: ReturnType<typeof vi.fn>;
  let rejectStewardTx: ReturnType<typeof vi.fn>;
  let walletAddresses: {
    evmAddress: string | null;
    solanaAddress: string | null;
  } | null;
  let walletConfig: {
    evmAddress?: string | null;
    executionReady?: boolean;
    executionBlockedReason?: string | null;
  } | null;

  beforeEach(() => {
    cleanup();
    tabCounter = 0;
    signatureCounter = 0;
    workspace = { mode: "web", tabs: [] };
    pendingApprovals = [];

    mockClient.getBrowserWorkspace.mockImplementation(async () =>
      clone(workspace),
    );
    mockClient.openBrowserWorkspaceTab.mockImplementation(
      async ({
        show = true,
        title,
        url = "about:blank",
      }: {
        show?: boolean;
        title?: string;
        url?: string;
      }) => {
        tabCounter += 1;
        const nextTab = {
          ...createTab(`tab-${tabCounter}`, url, show),
          title: title ?? createTab(`tab-${tabCounter}`, url, show).title,
        };
        workspace = {
          mode: "web",
          tabs: [
            ...workspace.tabs.map((tab) => ({
              ...tab,
              visible: false,
            })),
            nextTab,
          ],
        };
        return { tab: clone(nextTab) };
      },
    );
    mockClient.navigateBrowserWorkspaceTab.mockImplementation(
      async (id: string, url: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  title: new URL(url).hostname,
                  updatedAt: FIXED_TIMESTAMP,
                  url,
                }
              : tab,
          ),
        };
        const tab = workspace.tabs.find((entry) => entry.id === id);
        if (!tab) {
          throw new Error(`Missing tab ${id}`);
        }
        return { tab: clone(tab) };
      },
    );
    mockClient.showBrowserWorkspaceTab.mockImplementation(
      async (id: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.map((tab) => ({
            ...tab,
            lastFocusedAt: tab.id === id ? FIXED_TIMESTAMP : tab.lastFocusedAt,
            visible: tab.id === id,
          })),
        };
        const tab = workspace.tabs.find((entry) => entry.id === id);
        if (!tab) {
          throw new Error(`Missing tab ${id}`);
        }
        return { tab: clone(tab) };
      },
    );
    mockClient.closeBrowserWorkspaceTab.mockImplementation(
      async (id: string) => {
        workspace = {
          mode: "web",
          tabs: workspace.tabs.filter((tab) => tab.id !== id),
        };
        return { closed: true };
      },
    );
    mockClient.signViaSteward.mockImplementation(
      async ({
        chainId,
        to,
        value,
      }: {
        chainId: number;
        to: string;
        value: string;
      }) => {
        signatureCounter += 1;
        const txId = `tx-${signatureCounter}`;
        pendingApprovals = [
          ...pendingApprovals,
          createPendingApproval(txId, to, value, chainId),
        ];
        return {
          approved: false,
          pending: true,
          txId,
        };
      },
    );

    getStewardStatus = vi.fn(async () => ({
      agentId: "agent-browser",
      available: true,
      configured: true,
      connected: true,
      evmAddress: FIXED_WALLET_ADDRESS,
      walletAddresses: {
        evm: FIXED_WALLET_ADDRESS,
        solana: null,
      },
    }));
    getStewardPending = vi.fn(async () => clone(pendingApprovals));
    approveStewardTx = vi.fn(async (txId: string) => {
      pendingApprovals = pendingApprovals.filter(
        (item) => item.transaction.id !== txId,
      );
      return {
        ok: true,
        txHash: `0xapproved${txId}`,
      };
    });
    rejectStewardTx = vi.fn(async (txId: string) => {
      pendingApprovals = pendingApprovals.filter(
        (item) => item.transaction.id !== txId,
      );
      return {
        ok: true,
        txHash: `0xrejected${txId}`,
      };
    });
    executeBscTransfer = mockExecuteBscTransfer.mockImplementation(
      async ({
        amount,
        assetSymbol,
        toAddress,
      }: {
        amount: string;
        assetSymbol: string;
        toAddress: string;
      }) => ({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress,
        amount,
        assetSymbol,
        unsignedTx: {
          chainId: 56,
          from: FIXED_WALLET_ADDRESS,
          to: toAddress,
          data: "0x",
          valueWei: "0",
          explorerUrl: "https://bscscan.com",
          assetSymbol,
          amount,
        },
        execution: {
          hash: FIXED_LOCAL_TX_HASH,
          nonce: 7,
          gasLimit: "21000",
          valueWei: "0",
          explorerUrl: `https://bscscan.com/tx/${FIXED_LOCAL_TX_HASH}`,
          blockNumber: null,
          status: "pending",
        },
      }),
    );
    walletAddresses = {
      evmAddress: FIXED_WALLET_ADDRESS,
      solanaAddress: null,
    };
    walletConfig = {
      evmAddress: FIXED_WALLET_ADDRESS,
      executionReady: true,
      executionBlockedReason: null,
    };
    mockClient.getWalletConfig.mockResolvedValue(walletConfig);

    mockUseApp.mockImplementation(() => ({
      approveStewardTx,
      copyToClipboard: mockCopyToClipboard,
      executeBscTransfer,
      getStewardPending,
      getStewardStatus,
      rejectStewardTx,
      setActionNotice: mockSetActionNotice,
      t: (
        key: string,
        options?: {
          defaultValue?: string;
          [name: string]: unknown;
        },
      ) => options?.defaultValue ?? key,
      walletAddresses,
      walletConfig,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens and switches logical browser tabs in the web workspace", async () => {
    render(React.createElement(BrowserWorkspaceView));

    await waitFor(() => {
      expect(mockClient.getBrowserWorkspace).toHaveBeenCalled();
    });

    expect(screen.queryByText(/iframe mounted/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Enter a URL"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(mockClient.openBrowserWorkspaceTab).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "example.com",
          url: "https://example.com/",
        }),
      );
    });

    expect(
      await screen.findByRole("button", { name: "example.com" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Enter a URL"), {
      target: { value: "https://milady.ai" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "New tab" })[0]);

    expect(
      await screen.findByRole("button", { name: "milady.ai" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "example.com" }));

    await waitFor(() => {
      expect(mockClient.showBrowserWorkspaceTab).toHaveBeenCalledWith("tab-1");
    });

    expect(screen.getByTitle("example.com")).toBeTruthy();
    expect(screen.getByTestId("browser-workspace-wallet-panel")).toBeTruthy();
  });

  it("renders a real collapsed rail instead of squeezing the sidebar body", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://example.com/", true)],
    };

    render(React.createElement(BrowserWorkspaceView));

    expect(await screen.findByText("Browser workspace")).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("browser-workspace-sidebar-collapse-toggle"),
    );

    const sidebar = screen.getByTestId("browser-workspace-sidebar");
    expect(sidebar.getAttribute("data-collapsed")).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", { name: "New tab" }),
    ).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", { name: "example.com" }),
    ).toBeTruthy();
    expect(within(sidebar).queryByText("Mode notes")).toBeNull();
  });

  it("queues and approves Steward signing requests beside the browser workspace", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://swap.example/", true)],
    };

    render(React.createElement(BrowserWorkspaceView));

    expect(await screen.findByText("Steward connected")).toBeTruthy();
    expect(screen.getAllByText("swap.example").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "0xabc0000000000000000000000000000000000000" },
    });
    fireEvent.change(screen.getByLabelText("Value (wei)"), {
      target: { value: "1000000000000000" },
    });
    fireEvent.change(screen.getByLabelText("Chain ID"), {
      target: { value: "8453" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Bridge the browser action to Steward" },
    });
    fireEvent.change(screen.getByLabelText("Calldata (optional)"), {
      target: { value: "0xdeadbeef" },
    });
    fireEvent.click(screen.getByTestId("browser-workspace-sign-submit"));

    await waitFor(() => {
      expect(mockClient.signViaSteward).toHaveBeenCalledWith(
        expect.objectContaining({
          broadcast: true,
          chainId: 8453,
          data: "0xdeadbeef",
          description: "Bridge the browser action to Steward",
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
        }),
      );
    });

    expect(
      await screen.findByText(/Queued for approval on Base\. Request ID: tx-1/),
    ).toBeTruthy();

    const approveButton = await screen.findByRole("button", {
      name: "Approve",
    });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(approveStewardTx).toHaveBeenCalledWith("tx-1");
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    });

    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Signature request queued for approval.",
      "info",
      4000,
    );
  });

  it("falls back to the Wallets-tab transfer flow when Steward is unavailable", async () => {
    workspace = {
      mode: "web",
      tabs: [createTab("tab-1", "https://bscscan.com/", true)],
    };
    walletConfig = null;
    mockClient.getWalletConfig.mockResolvedValue({
      evmAddress: FIXED_WALLET_ADDRESS,
      executionReady: true,
      executionBlockedReason: null,
    });
    getStewardStatus.mockResolvedValue({
      agentId: "agent-browser",
      available: false,
      configured: false,
      connected: false,
      error: null,
    });

    render(React.createElement(BrowserWorkspaceView));

    expect(await screen.findByText("Local wallet ready")).toBeTruthy();
    expect(screen.queryByText("Approval queue")).toBeNull();

    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "0xabc0000000000000000000000000000000000000" },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "0.125" },
    });
    fireEvent.change(screen.getByLabelText("Asset"), {
      target: { value: "BNB" },
    });
    fireEvent.click(screen.getByTestId("browser-workspace-sign-submit"));

    await waitFor(() => {
      expect(executeBscTransfer).toHaveBeenCalledWith({
        toAddress: "0xabc0000000000000000000000000000000000000",
        amount: "0.125",
        assetSymbol: "BNB",
        tokenAddress: undefined,
        confirm: true,
      });
    });

    expect(
      await screen.findByText(
        `Submitted BNB transfer on BSC: ${FIXED_LOCAL_TX_HASH}.`,
      ),
    ).toBeTruthy();
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      `Submitted BNB transfer on BSC: ${FIXED_LOCAL_TX_HASH}.`,
      "success",
      4000,
    );
  });
});
