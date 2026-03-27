// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: (props: Record<string, unknown>) =>
    React.createElement(
      "button",
      { type: "button", ...props },
      props.children as React.ReactNode,
    ),
  Select: (props: Record<string, unknown>) =>
    React.createElement("mock-select", props, props.children as React.ReactNode),
  SelectTrigger: (props: Record<string, unknown>) =>
    React.createElement(
      "button",
      { type: "button", ...props },
      props.children as React.ReactNode,
    ),
  SelectContent: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  SelectItem: (props: Record<string, unknown>) =>
    React.createElement("mock-option", props, props.children as React.ReactNode),
  SelectValue: (props: Record<string, unknown>) =>
    React.createElement("span", props, props.children as React.ReactNode),
  Tooltip: (props: Record<string, unknown>) =>
    React.createElement(React.Fragment, null, props.children as React.ReactNode),
  TooltipContent: (props: Record<string, unknown>) =>
    React.createElement("div", props, props.children as React.ReactNode),
  TooltipProvider: (props: Record<string, unknown>) =>
    React.createElement(React.Fragment, null, props.children as React.ReactNode),
  TooltipTrigger: (props: Record<string, unknown>) =>
    React.createElement(React.Fragment, null, props.children as React.ReactNode),
}));

vi.mock("../BscTradePanel", () => ({
  TradePanel: () => React.createElement("div", { "data-testid": "trade-panel" }),
}));

vi.mock("../desktop-surface-primitives", () => ({
  DESKTOP_PAGE_CONTENT_CLASSNAME: "page-content",
  DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME: "summary-card",
  DESKTOP_SURFACE_PANEL_CLASSNAME: "surface-panel",
  DesktopPageFrame: (props: Record<string, unknown>) =>
    React.createElement(
      "div",
      { "data-testid": "desktop-page-frame" },
      props.children as React.ReactNode,
    ),
}));

vi.mock("../inventory/NftGrid", () => ({
  NftGrid: () => React.createElement("div", { "data-testid": "nft-grid" }),
}));

vi.mock("../inventory/TokensTable", () => ({
  TokensTable: () =>
    React.createElement("div", { "data-testid": "tokens-table" }),
}));

vi.mock("../inventory/useInventoryData", () => ({
  useInventoryData: ({
    inventoryChainFocus,
  }: {
    inventoryChainFocus: string;
  }) => ({
    chainFocus: inventoryChainFocus ?? "all",
    tokenRows: [
      { chain: "ethereum", balanceRaw: 1, valueUsd: 10 },
      { chain: "base", balanceRaw: 1, valueUsd: 5 },
      { chain: "bsc", balanceRaw: 1, valueUsd: 3 },
      { chain: "solana", balanceRaw: 1, valueUsd: 2 },
    ],
    allNfts: [],
    focusedChainError: null,
    focusedChainName:
      inventoryChainFocus === "all" ? null : inventoryChainFocus,
    visibleRows: [],
    totalUsd: 20,
    visibleChainErrors: [],
    focusedNativeBalance: "1.0",
  }),
}));

import { InventoryView } from "../InventoryView";

function t(key: string): string {
  const translations: Record<string, string> = {
    "wallet.tokens": "Tokens",
    "wallet.nfts": "NFTs",
    "wallet.sort": "Sort",
    "wallet.value": "Value",
    "wallet.chain": "Chain",
    "wallet.name": "Name",
    "wallet.copyEvmAddress": "Copy EVM address",
    "wallet.copySolanaAddress": "Copy Solana address",
    "common.refresh": "Refresh",
    "common.retry": "Retry",
  };

  return translations[key] ?? key;
}

function createContext(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    walletConfig: {
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
      managedBscRpcReady: true,
      cloudManagedAccess: true,
      ethereumBalanceReady: true,
      baseBalanceReady: true,
      bscBalanceReady: true,
      avalancheBalanceReady: true,
      solanaBalanceReady: true,
      alchemyKeySet: true,
      ankrKeySet: true,
      heliusKeySet: true,
      legacyCustomChains: [],
    },
    walletAddresses: {
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
    },
    walletBalances: {
      evm: {
        chains: [
          { chain: "ethereum", error: null },
          { chain: "base", error: null },
          { chain: "bsc", error: null },
          { chain: "avax", error: null },
        ],
      },
      solana: {},
    },
    walletNfts: { evm: [], solana: null },
    walletLoading: false,
    walletNftsLoading: false,
    inventoryView: "tokens",
    inventorySort: "value",
    inventoryChainFocus: "all",
    walletError: null,
    elizaCloudConnected: false,
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    setTab: vi.fn(),
    setActionNotice: vi.fn(),
    executeBscTrade: vi.fn(),
    getBscTradePreflight: vi.fn(),
    getBscTradeQuote: vi.fn(),
    getBscTradeTxStatus: vi.fn(),
    getStewardStatus: vi.fn(async () => null),
    copyToClipboard: vi.fn(async () => {}),
    t,
  };

  Object.assign(ctx, overrides);
  ctx.setState = vi.fn((key: string, value: unknown) => {
    ctx[key] = value;
  });

  return ctx;
}

describe("InventoryView wallet settings", () => {
  it("renders the token sort control and dispatches inventorySort updates", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    const overviewCard = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-overview-card",
    );
    expect(overviewCard).toBeTruthy();

    const sortTrigger = overviewCard?.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-sort-select",
    );
    expect(sortTrigger).toBeTruthy();

    const summarySortPill = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-summary-sort-pill",
    );
    expect(summarySortPill).toBeTruthy();
    expect(JSON.stringify(summarySortPill?.props.children)).toContain("Sort");
    expect(JSON.stringify(summarySortPill?.props.children)).toContain("Value");

    const assetsHeader = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-assets-header",
    );
    expect(assetsHeader).toBeTruthy();
    expect(
      assetsHeader?.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-testid"] === "wallet-sort-select",
      ),
    ).toHaveLength(0);

    const routePill = tree?.root.find(
      (node) => node.props["data-testid"] === "wallet-funding-route-pill",
    );
    expect(routePill).toBeTruthy();
    expect(JSON.stringify(routePill?.props.children)).toContain("funding route");
    expect(
      assetsHeader?.findAll(
        (node) => node.props["data-testid"] === "wallet-assets-sort-meta",
      ),
    ).toHaveLength(0);

    const sortSelect = overviewCard?.find(
      (node) =>
        node.type === "mock-select" && node.props.value === ctx.inventorySort,
    );
    expect(sortSelect).toBeTruthy();

    await act(async () => {
      sortSelect?.props.onValueChange("chain");
    });

    expect(ctx.setState).toHaveBeenCalledWith("inventorySort", "chain");
  });

  it("hides the sort control in NFT view", async () => {
    const ctx = createContext({ inventoryView: "nfts" });
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-testid"] === "wallet-sort-select",
      ),
    ).toHaveLength(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-funding-route-pill",
      ),
    ).toHaveLength(1);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-summary-sort-pill",
      ),
    ).toHaveLength(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "wallet-overview-sort-block",
      ),
    ).toHaveLength(0);
  });

  it("keeps the simplified wallet shell and interactive chain icon grid", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<InventoryView />);
    });

    expect(JSON.stringify(tree?.toJSON())).toContain("Wallet Overview");
    expect(
      tree?.root.findAll((node) => node.children.includes("WALLET")),
    ).toHaveLength(0);

    const baseButton = tree?.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Base",
    );
    expect(baseButton).toBeTruthy();

    await act(async () => {
      baseButton?.props.onClick();
    });

    expect(ctx.setState).toHaveBeenCalledWith("inventoryChainFocus", "base");
  });
});
