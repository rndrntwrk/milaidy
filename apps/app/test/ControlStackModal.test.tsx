import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../src/AppContext.js";
import { ControlStackModal } from "../src/components/ControlStackModal.js";

vi.mock("../src/AppContext.js", () => ({
  useApp: vi.fn(),
}));

vi.mock("../src/miladyHudRouting.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/miladyHudRouting.js")>(
      "../src/miladyHudRouting.js",
    );
  return {
    ...actual,
    getControlStackSections: () =>
      actual.getControlStackSections({ appsEnabled: false }),
    getControlStackSectionMeta: (section: Parameters<typeof actual.getControlStackSectionMeta>[0]) =>
      actual.getControlStackSectionMeta(section, { appsEnabled: false }),
    sanitizeControlSection: (
      section?: Parameters<typeof actual.sanitizeControlSection>[0],
    ) => actual.sanitizeControlSection(section, { appsEnabled: false }),
    defaultTabForControlSection: (
      section: Parameters<typeof actual.defaultTabForControlSection>[0],
    ) => actual.defaultTabForControlSection(section, { appsEnabled: false }),
    controlSectionForTab: (tab: Parameters<typeof actual.controlSectionForTab>[0]) =>
      actual.controlSectionForTab(tab, { appsEnabled: false }),
  };
});

vi.mock("../src/components/SettingsView.js", () => ({
  SettingsView: () => <div>SettingsViewMock</div>,
}));
vi.mock("../src/components/AdvancedPageView.js", () => ({
  AdvancedPageView: () => <div>AdvancedPageViewMock</div>,
}));
vi.mock("../src/components/AppsPageView.js", () => ({
  AppsPageView: () => <div>AppsPageViewMock</div>,
}));
vi.mock("../src/components/ConnectorsPageView.js", () => ({
  ConnectorsPageView: () => <div>ConnectorsPageViewMock</div>,
}));
vi.mock("../src/components/ui/Button.js", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("../src/components/ui/Badge.js", () => ({
  Badge: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock("../src/components/ui/Icons.js", () => ({
  CloseIcon: () => <span>CloseIcon</span>,
  StackIcon: () => <span>StackIcon</span>,
}));
vi.mock("../src/components/shared/themeDisplayName.js", () => ({
  resolveThemeDisplayName: () => "Milady",
}));

function buttonText(button: ReactTestInstance): string {
  const children = button.props.children;
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.join("");
  return "";
}

describe("ControlStackModal", () => {
  it("renders section pills from the shared routing contract and hides apps when gated off", async () => {
    const setTab = vi.fn();

    // @ts-expect-error test uses a narrowed context subset.
    vi.spyOn(AppContext, "useApp").mockReturnValue({
      tab: "settings",
      setTab,
    });

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(
        <ControlStackModal open section="settings" onClose={vi.fn()} />,
      );
    });

    const buttons = renderer?.root.findAllByType("button") ?? [];
    const labels = buttons.map((button) => buttonText(button));

    expect(labels).toContain("Settings");
    expect(labels).toContain("Advanced");
    expect(labels).not.toContain("Apps");

    const advancedButton = buttons.find((button) => buttonText(button) === "Advanced");
    expect(advancedButton).toBeDefined();

    await act(async () => {
      advancedButton?.props.onClick();
    });

    expect(setTab).toHaveBeenCalledWith("advanced");
  });
});
