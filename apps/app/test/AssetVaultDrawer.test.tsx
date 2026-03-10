import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../src/AppContext.js";
import { AssetVaultDrawer } from "../src/components/AssetVaultDrawer.js";

vi.mock("../src/AppContext.js", () => ({
  useApp: vi.fn(),
}));

vi.mock("../src/components/DrawerShell.js", () => ({
  DrawerShell: ({ title, toolbar, summary, children }: any) => (
    <div>
      <h1>{title}</h1>
      {toolbar}
      {summary}
      {children}
    </div>
  ),
}));
vi.mock("../src/components/SectionShell.js", () => ({
  SectionShell: ({ title, children }: any) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock("../src/components/SummaryStatRow.js", () => ({
  SummaryStatRow: () => <div>SummaryStatRowMock</div>,
}));
vi.mock("../src/components/AvatarSelector.js", () => ({
  AvatarSelector: () => <div>AvatarSelectorMock</div>,
}));
vi.mock("../src/components/shared/agentDisplayName.js", () => ({
  resolveAgentDisplayName: () => "Milady",
}));
vi.mock("../src/components/ui/Button.js", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("../src/components/ui/Sheet.js", () => ({
  Sheet: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));
vi.mock("../src/components/ui/Icons.js", () => ({
  VaultIcon: () => <span>VaultIcon</span>,
}));

function buttonText(button: ReactTestInstance): string {
  const children = button.props.children;
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.join("");
  return "";
}

function sectionTitle(renderer: ReturnType<typeof create> | null): string {
  const heading = renderer?.root.findAllByType("h2")[0];
  if (!heading) return "";
  const children = heading.props.children;
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.join("");
  return "";
}

describe("AssetVaultDrawer", () => {
  it("uses the shared section prop as the source of truth and routes section switches through openHudAssetVault", async () => {
    const openHudAssetVault = vi.fn();

    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({
      characterData: {},
      selectedVrmIndex: 1,
      walletAddresses: null,
      walletBalances: null,
      agentStatus: null,
      setState: vi.fn(),
      setTab: vi.fn(),
      openHudAssetVault,
    });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(
        <AssetVaultDrawer open section="identity" onClose={vi.fn()} />,
      );
    });

    expect(sectionTitle(renderer)).toBe("Identity");

    const walletButton = renderer?.root
      .findAllByType("button")
      .find((button) => buttonText(button) === "Wallets");
    expect(walletButton).toBeDefined();

    await act(async () => {
      walletButton?.props.onClick();
    });

    expect(openHudAssetVault).toHaveBeenCalledWith("wallets");
    expect(sectionTitle(renderer)).toBe("Identity");

    await act(async () => {
      renderer?.update(
        <AssetVaultDrawer open section="wallets" onClose={vi.fn()} />,
      );
    });

    expect(sectionTitle(renderer)).toBe("Wallets");
  });
});
