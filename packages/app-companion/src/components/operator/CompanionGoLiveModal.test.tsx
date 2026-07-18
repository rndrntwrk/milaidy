// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginInfo } from "@elizaos/ui";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("@elizaos/ui", async () => {
  const React = await import("react");
  const CloseContext = React.createContext<(open: boolean) => void>(() => {});
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  );
  return {
    Button: React.forwardRef<
      HTMLButtonElement,
      React.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: string;
        size?: string;
      }
    >(function MockButton({ variant, size, ...props }, ref) {
      void variant;
      void size;
      return <button ref={ref} type="button" {...props} />;
    }),
    ConfigRenderer: () => <div data-testid="config-renderer" />,
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: React.PropsWithChildren<{
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }>) =>
      open === false ? null : (
        <CloseContext.Provider value={onOpenChange ?? (() => {})}>
          {children}
        </CloseContext.Provider>
      ),
    DialogClose: ({
      children,
    }: React.PropsWithChildren<{ asChild?: boolean }>) => {
      const close = React.useContext(CloseContext);
      if (!React.isValidElement(children)) return children;
      const child = children as React.ReactElement<{
        onClick?: React.MouseEventHandler;
      }>;
      return React.cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event);
          close(false);
        },
      });
    },
    DialogContent: ({
      children,
      showCloseButton,
      ...props
    }: React.PropsWithChildren<
      Record<string, unknown> & { showCloseButton?: boolean }
    >) => {
      void showCloseButton;
      return (
        <div role="dialog" {...props}>
          {children}
        </div>
      );
    },
    DialogDescription: passthrough,
    DialogTitle: passthrough,
    defaultRegistry: {},
    paramsToSchema: () => ({
      schema: { type: "object", properties: {} },
      hints: {},
    }),
    cn: (...values: Array<string | false | null | undefined>) =>
      values.filter(Boolean).join(" "),
    useApp: () => mockUseApp(),
  };
});

import { CompanionGoLiveModal } from "./CompanionGoLiveModal";
import type { useCompanionStageOperator } from "./useCompanionStageOperator";

type CompanionStageOperator = ReturnType<typeof useCompanionStageOperator>;

const streamPlugin: PluginInfo = {
  id: "@rndrntwrk/plugin-555stream",
  name: "555 Stream",
  description: "Alice livestream control plane",
  enabled: true,
  configured: true,
  envKey: null,
  category: "streaming",
  source: "bundled",
  parameters: [
    {
      key: "STREAM555_AGENT_TOKEN",
      type: "string",
      description: "Agent token",
      required: true,
      sensitive: true,
      currentValue: "configured",
      isSet: true,
    },
    {
      key: "STREAM555_DEST_TWITCH_ENABLED",
      type: "boolean",
      description: "Twitch enabled",
      required: false,
      sensitive: false,
      currentValue: "true",
      isSet: true,
    },
    {
      key: "STREAM555_DEST_TWITCH_RTMP_URL",
      type: "string",
      description: "Twitch RTMP URL",
      required: true,
      sensitive: false,
      currentValue: "rtmps://example.invalid/live",
      isSet: true,
    },
    {
      key: "STREAM555_DEST_TWITCH_STREAM_KEY",
      type: "string",
      description: "Twitch stream key",
      required: true,
      sensitive: true,
      currentValue: "configured",
      isSet: true,
    },
  ],
  validationErrors: [],
  validationWarnings: [],
};

function t(key: string, options?: Record<string, unknown>): string {
  return typeof options?.defaultValue === "string" ? options.defaultValue : key;
}

function createOperatorFixture() {
  const performGuidedGoLive = vi.fn(async () => ({
    state: "success" as const,
    tone: "success" as const,
    message: "Alice is live.",
  }));
  const operator = {
    isAliceActive: true,
    executePlan: vi.fn(async () => ({ results: [] })),
    performGuidedGoLive,
    stream: {
      available: true,
      pluginPresent: true,
      capabilityPresent: true,
      capabilityResolved: true,
      live: false,
      loading: false,
      error: null,
      uptime: 0,
      frameCount: 0,
      destinations: [{ id: "twitch", name: "Twitch" }],
      destinationsLoading: false,
      activeDestination: null,
      refreshStatus: vi.fn(async () => ({ status: null, error: null })),
      refreshDestinations: vi.fn(async () => undefined),
      endLive: vi.fn(async () => undefined),
      runScreenShareAction: vi.fn(async () => undefined),
      runRadioAction: vi.fn(async () => undefined),
      runReactionAction: vi.fn(async () => undefined),
      runAdsAction: vi.fn(async () => undefined),
      runPipAction: vi.fn(),
      runInviteGuestAction: vi.fn(),
      runEarningsAction: vi.fn(),
    },
    arcade: {
      runtimeAvailable: true,
      games: [{ id: "game-1", name: "Alice Kart" }],
      selectedGameId: "game-1",
      setSelectedGameId: vi.fn(),
      selectedGameLabel: "Alice Kart",
      gameState: null,
      catalogLoading: false,
      stateLoading: false,
      busyAction: null,
      catalogError: null,
      stateError: null,
      refreshCatalog: vi.fn(async () => undefined),
      refreshState: vi.fn(async () => undefined),
      startSelectedGame: vi.fn(async () => undefined),
      switchSelectedGame: vi.fn(async () => undefined),
      stopArcadeSession: vi.fn(async () => undefined),
      goLiveAndPlay: vi.fn(async () => undefined),
      phaseLabel: "Ready",
    },
    hyperscape: {
      available: false,
      loading: false,
      error: null,
      agent: null,
      goal: null,
      quickCommands: [],
      runQuickCommand: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    },
    emotes: {
      loading: false,
      error: null,
      activeEmoteId: null,
      pinned: [],
      groups: [],
      playEmote: vi.fn(async () => undefined),
      stopEmote: vi.fn(),
      refresh: vi.fn(async () => undefined),
    },
    utility: {
      openSwapSurface: vi.fn(),
      openAutonomousRunSurface: vi.fn(),
    },
  } satisfies CompanionStageOperator;
  return { operator, performGuidedGoLive };
}

function renderModal({
  operator,
  onOpenChange = vi.fn(),
  preferredMode = "camera",
}: {
  operator: CompanionStageOperator;
  onOpenChange?: (open: boolean) => void;
  preferredMode?:
    | "camera"
    | "screen-share"
    | "play-games"
    | "reaction"
    | "radio";
}) {
  const onPreferredModeChange = vi.fn();
  render(
    <CompanionGoLiveModal
      open
      onOpenChange={onOpenChange}
      preferredMode={preferredMode}
      onPreferredModeChange={onPreferredModeChange}
      operator={operator}
    />,
  );
  return { onOpenChange, onPreferredModeChange };
}

describe("CompanionGoLiveModal", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      handlePluginConfigSave: vi.fn(async () => undefined),
      loadPlugins: vi.fn(async () => undefined),
      pluginSaving: new Set<string>(),
      plugins: [streamPlugin],
      walletAddresses: {
        evmAddress: "0x0000000000000000000000000000000000000001",
      },
      t,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("closes without launching when Cancel is pressed", async () => {
    const user = userEvent.setup();
    const { operator, performGuidedGoLive } = createOperatorFixture();
    const onOpenChange = vi.fn();
    renderModal({ operator, onOpenChange });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(performGuidedGoLive).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("launches the reviewed Twitch channel and camera mode", async () => {
    const user = userEvent.setup();
    const { operator, performGuidedGoLive } = createOperatorFixture();
    renderModal({ operator, preferredMode: "camera" });

    const progress = screen.getByRole("list", { name: "Go live progress" });
    expect(
      within(progress)
        .getByText("Channels")
        .closest("li")
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(
      (screen.getByRole("checkbox", { name: /twitch/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      (screen.getByRole("radio", { name: /^camera/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Launch now" }));

    expect(performGuidedGoLive).toHaveBeenCalledWith({
      channels: ["twitch"],
      launchMode: "camera",
      selectedGameId: "game-1",
    });
  });

  it("focuses an actionable alert when no channel is selected", async () => {
    const user = userEvent.setup();
    const { operator, performGuidedGoLive } = createOperatorFixture();
    renderModal({ operator });

    await user.click(screen.getByRole("checkbox", { name: /twitch/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/select at least one ready channel/i);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(performGuidedGoLive).not.toHaveBeenCalled();
  });

  it("keeps the modal shell, body, footer, and short-height stepper bounded", () => {
    const css = readFileSync(
      resolve(process.cwd(), "../app-core/src/styles/alice-companion.css"),
      "utf8",
    );

    expect(css).toMatch(/\.go-live-modal__shell\s*{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(
      /\.go-live-modal__body\s*{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s,
    );
    expect(css).toMatch(/\.go-live-modal__footer\s*{[^}]*flex:\s*0 0 auto/s);
    expect(css).toMatch(
      /@media \(max-height: 680px\)[\s\S]*overflow-x:\s*auto/,
    );
  });
});
