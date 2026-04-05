import { afterEach, describe, expect, it, vi } from "vitest";

const browserWorkspaceMocks = vi.hoisted(() => ({
  evaluateBrowserWorkspaceTab: vi.fn(),
  getBrowserWorkspaceMode: vi.fn(() => "web"),
  listBrowserWorkspaceTabs: vi.fn(),
  closeBrowserWorkspaceTab: vi.fn(),
  hideBrowserWorkspaceTab: vi.fn(),
  navigateBrowserWorkspaceTab: vi.fn(),
  openBrowserWorkspaceTab: vi.fn(),
  showBrowserWorkspaceTab: vi.fn(),
  snapshotBrowserWorkspaceTab: vi.fn(),
}));

const stewardWalletMocks = vi.hoisted(() => ({
  approveStewardWalletRequest: vi.fn(),
  getStewardPendingApprovals: vi.fn(),
  getStewardWalletStatus: vi.fn(),
  getStewardWalletUnavailableMessage: vi.fn(
    () =>
      "Milady agent wallet is unavailable. Configure Steward in Milady wallet settings or set STEWARD_API_URL and Steward credentials.",
  ),
  rejectStewardWalletRequest: vi.fn(),
  signWithStewardWallet: vi.fn(),
}));

vi.mock("@miladyai/agent/services/browser-workspace", () => ({
  closeBrowserWorkspaceTab: browserWorkspaceMocks.closeBrowserWorkspaceTab,
  evaluateBrowserWorkspaceTab:
    browserWorkspaceMocks.evaluateBrowserWorkspaceTab,
  getBrowserWorkspaceMode: browserWorkspaceMocks.getBrowserWorkspaceMode,
  hideBrowserWorkspaceTab: browserWorkspaceMocks.hideBrowserWorkspaceTab,
  listBrowserWorkspaceTabs: browserWorkspaceMocks.listBrowserWorkspaceTabs,
  navigateBrowserWorkspaceTab:
    browserWorkspaceMocks.navigateBrowserWorkspaceTab,
  openBrowserWorkspaceTab: browserWorkspaceMocks.openBrowserWorkspaceTab,
  showBrowserWorkspaceTab: browserWorkspaceMocks.showBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab:
    browserWorkspaceMocks.snapshotBrowserWorkspaceTab,
}));

vi.mock("@miladyai/agent/services/steward-wallet", () => ({
  approveStewardWalletRequest: stewardWalletMocks.approveStewardWalletRequest,
  getStewardPendingApprovals: stewardWalletMocks.getStewardPendingApprovals,
  getStewardWalletStatus: stewardWalletMocks.getStewardWalletStatus,
  getStewardWalletUnavailableMessage:
    stewardWalletMocks.getStewardWalletUnavailableMessage,
  rejectStewardWalletRequest: stewardWalletMocks.rejectStewardWalletRequest,
  signWithStewardWallet: stewardWalletMocks.signWithStewardWallet,
}));

import { manageMiladyBrowserWorkspaceAction } from "./action";
import { miladyBrowserWorkspaceProvider } from "./provider";
import {
  approveMiladyWalletRequestAction,
  rejectMiladyWalletRequestAction,
  signWithMiladyWalletAction,
} from "./wallet-action";

afterEach(() => {
  vi.clearAllMocks();
});

describe("@miladyai/plugin-milady-browser", () => {
  it("opens a browser tab in web mode through the shared workspace service", async () => {
    browserWorkspaceMocks.openBrowserWorkspaceTab.mockResolvedValue({
      id: "btab_web_1",
      title: "example.com",
      url: "https://example.com/",
      partition: "persist:milady-browser",
      visible: true,
      createdAt: "2026-04-05T18:45:00.000Z",
      updatedAt: "2026-04-05T18:45:00.000Z",
      lastFocusedAt: "2026-04-05T18:45:00.000Z",
    });
    const callback = vi.fn();

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "Open https://example.com in the browser workspace",
        },
      } as never,
      undefined,
      {
        parameters: {
          operation: "open",
          url: "https://example.com",
          show: true,
        },
      },
      callback,
    );

    expect(browserWorkspaceMocks.openBrowserWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({
        show: true,
        url: "https://example.com",
      }),
    );
    expect(result).toMatchObject({ success: true });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Opened visible browser tab"),
      }),
    );
  });

  it("returns desktop-only eval errors instead of rejecting the action", async () => {
    browserWorkspaceMocks.evaluateBrowserWorkspaceTab.mockRejectedValue(
      new Error(
        "Milady browser workspace eval is only available in the desktop app.",
      ),
    );
    const callback = vi.fn();

    const result = await manageMiladyBrowserWorkspaceAction.handler(
      {} as never,
      {
        content: {
          text: "Run script in btab_web_1",
        },
      } as never,
      undefined,
      {
        parameters: {
          operation: "eval",
          id: "btab_web_1",
          script: "document.title",
        },
      },
      callback,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("only available in the desktop app"),
    });
  });

  it("queues signing requests and routes approve/reject actions", async () => {
    stewardWalletMocks.signWithStewardWallet.mockResolvedValue({
      approved: false,
      pending: true,
      txId: "tx-1",
    });
    stewardWalletMocks.approveStewardWalletRequest.mockResolvedValue({
      ok: true,
      txHash: "0xapprovedtx1",
    });
    stewardWalletMocks.rejectStewardWalletRequest.mockResolvedValue({
      ok: true,
    });

    const signResult = await signWithMiladyWalletAction.handler(
      {} as never,
      {
        content: {
          text: "Sign a Base transaction",
        },
      } as never,
      undefined,
      {
        parameters: {
          to: "0xabc0000000000000000000000000000000000000",
          value: "1000000000000000",
          chainId: 8453,
          data: "0xdeadbeef",
        },
      },
      vi.fn(),
    );
    const approveResult = await approveMiladyWalletRequestAction.handler(
      {} as never,
      { content: { text: "Approve tx-1" } } as never,
      undefined,
      { parameters: { txId: "tx-1" } },
      vi.fn(),
    );
    const rejectResult = await rejectMiladyWalletRequestAction.handler(
      {} as never,
      { content: { text: "Reject tx-2 because user cancelled" } } as never,
      undefined,
      { parameters: { txId: "tx-2", reason: "user cancelled" } },
      vi.fn(),
    );

    expect(stewardWalletMocks.signWithStewardWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        data: "0xdeadbeef",
        to: "0xabc0000000000000000000000000000000000000",
        value: "1000000000000000",
      }),
    );
    expect(signResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Queued the Base transaction for approval"),
    });
    expect(approveResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Approved Steward request tx-1"),
    });
    expect(rejectResult).toMatchObject({
      success: true,
      text: expect.stringContaining("Rejected Steward request tx-2"),
    });
  });

  it("summarizes web tabs and pending wallet approvals in the provider", async () => {
    browserWorkspaceMocks.listBrowserWorkspaceTabs.mockResolvedValue([
      {
        id: "btab_web_1",
        title: "example.com",
        url: "https://example.com/",
        partition: "persist:milady-browser",
        visible: true,
        createdAt: "2026-04-05T18:45:00.000Z",
        updatedAt: "2026-04-05T18:45:00.000Z",
        lastFocusedAt: "2026-04-05T18:45:00.000Z",
      },
    ]);
    stewardWalletMocks.getStewardWalletStatus.mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "agent-browser",
      walletAddresses: {
        evm: "0x1234567890abcdef1234567890abcdef12345678",
        solana: null,
      },
    });
    stewardWalletMocks.getStewardPendingApprovals.mockResolvedValue([
      {
        queueId: "queue:tx-1",
        requestedAt: "2026-04-05T18:45:00.000Z",
        status: "pending",
        transaction: {
          id: "tx-1",
          request: {
            to: "0xabc0000000000000000000000000000000000000",
            value: "1",
            chainId: 8453,
          },
          policyResults: [],
          status: "pending",
          agentId: "agent-browser",
          createdAt: "2026-04-05T18:45:00.000Z",
        },
      },
    ]);

    const result = await miladyBrowserWorkspaceProvider.get?.(
      {} as never,
      {} as never,
      {} as never,
    );

    expect(result?.text).toContain(
      "Milady browser workspace (web): 1 tab open.",
    );
    expect(result?.text).toContain("Steward connected with 1 pending approval");
    expect(result?.data).toMatchObject({
      available: true,
      mode: "web",
      pendingApprovals: 1,
      tabs: [{ id: "btab_web_1" }],
    });
  });
});
