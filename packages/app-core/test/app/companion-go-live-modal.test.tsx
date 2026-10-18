// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInlineUiMock } from "./mockInlineUi";
import { findButtonByText, textOf } from "../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());
const readNativeSetup = vi.hoisted(() => vi.fn());
vi.mock("@miladyai/ui", () => createInlineUiMock({}));
vi.mock("@miladyai/app-core/state", () => ({ useApp: () => mockUseApp() }));
vi.mock("@miladyai/app-core/api", () => ({ client: { getStream555NativeSetup: readNativeSetup } }));
import { CompanionGoLiveModal } from "../../src/components/operator/CompanionGoLiveModal";
import { buildStream555SetupSummary } from "../../src/components/operator/stream555-setup";

function t(key: string, options?: Record<string, unknown>) { return String(options?.defaultValue ?? key); }
function saved(revision = 7) { return {
  sessionId: "alice-session", studioUrl: "https://stream.rndrntwrk.com/studio?sessionId=alice-session",
  revision, aspectRatio: "16:9", activeLayout: "pip", pipPosition: "bottom-right", overlay: { enabled: true, mode: "filter" }, active: true,
  sources: [{ id: "game", type: "game", name: "555 Drive", gameId: "555drive", avatarPreset: null, visible: true },
    { id: "pip", type: "avatar", name: "Alice", gameId: null, avatarPreset: "alice-3d", visible: true }],
  destinations: [{ platformId: "youtube", enabled: true, configured: true }],
}; }
function createReadyPlugin() { return { id: "555stream", name: "555 Stream", parameters: [
  { key: "STREAM555_AGENT_TOKEN", isSet: true }, { key: "STREAM555_DEST_X_ENABLED", currentValue: "true" },
  { key: "STREAM555_DEST_X_RTMP_URL", isSet: true }, { key: "STREAM555_DEST_X_STREAM_KEY", isSet: true }],
  validationWarnings: [], validationErrors: [] }; }
function createOperator() { return {
  stream: { refreshStatus: vi.fn(), refreshDestinations: vi.fn() },
  arcade: { refreshState: vi.fn(), runtimeAvailable: true, selectedGameId: "game-1", selectedGameLabel: "Super Alice Kart" },
  executePlan: vi.fn(), performGuidedGoLive: vi.fn(async () => ({ state: "success" })),
}; }
const props = (operator = createOperator()) => ({ open: true, onOpenChange: vi.fn(), preferredMode: "camera" as const,
  onPreferredModeChange: vi.fn(), operator });
async function mount(options = props()) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(React.createElement(CompanionGoLiveModal, options)); });
  return tree;
}

describe("CompanionGoLiveModal", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    readNativeSetup.mockReset().mockResolvedValue(saved());
    mockUseApp.mockReturnValue({ plugins: [createReadyPlugin()], t });
  });
  it("opens the same native session and refreshes upstream saved state without legacy operations", async () => {
    const operator = createOperator();
    const tree = await mount(props(operator));
    expect(readNativeSetup).toHaveBeenCalledTimes(1);
    expect(textOf(tree.root)).toContain("Revision 7");
    expect(textOf(tree.root)).toContain("555drive");
    expect(textOf(tree.root)).toContain("alice-3d");
    expect(textOf(tree.root)).toContain("Layout pip · PiP bottom-right");
    expect(textOf(tree.root)).toContain("youtube");
    expect(tree.root.findByType("a").props.href).toBe(saved().studioUrl);
    readNativeSetup.mockResolvedValue(saved(8));
    await act(async () => { findButtonByText(tree.root, "Refresh status").props.onClick(); });
    expect(textOf(tree.root)).toContain("Revision 8");
    expect(operator.stream.refreshStatus).not.toHaveBeenCalled();
    expect(operator.stream.refreshDestinations).not.toHaveBeenCalled();
    expect(operator.arcade.refreshState).not.toHaveBeenCalled();
    expect(operator.executePlan).not.toHaveBeenCalled();
  });
  it("deduplicates refreshes and ignores an obsolete read after close and reopen", async () => {
    let complete!: (value: ReturnType<typeof saved>) => void;
    readNativeSetup.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const options = props();
    const tree = await mount(options);
    await act(async () => { findButtonByText(tree.root, "Refresh status").props.onClick(); });
    expect(readNativeSetup).toHaveBeenCalledTimes(1);
    await act(async () => { tree.update(React.createElement(CompanionGoLiveModal, { ...options, open: false })); });
    await act(async () => { tree.update(React.createElement(CompanionGoLiveModal, options)); });
    expect(readNativeSetup).toHaveBeenCalledTimes(2);
    await act(async () => { complete(saved(1)); });
    expect(textOf(tree.root)).toContain("Revision 7");
    expect(textOf(tree.root)).not.toContain("Revision 1");
  });
  it("shows denied or missing native setup visibly with no legacy fallback or stale editor link", async () => {
    const operator = createOperator();
    const tree = await mount(props(operator));
    readNativeSetup.mockRejectedValue(new Error("Admission denied"));
    await act(async () => { findButtonByText(tree.root, "Refresh status").props.onClick(); });
    expect(textOf(tree.root.findByProps({ role: "alert" }))).toContain("Native Studio setup is unavailable");
    expect(tree.root.findAllByType("a")).toHaveLength(0);
    expect(operator.stream.refreshStatus).not.toHaveBeenCalled();
    expect(operator.stream.refreshDestinations).not.toHaveBeenCalled();
    expect(operator.arcade.refreshState).not.toHaveBeenCalled();
  });
  it("preserves channel checkbox semantics after explicitly continuing from setup", async () => {
    const tree = await mount();
    await act(async () => { findButtonByText(tree.root, "Continue").props.onClick(); });
    expect(tree.root.findAll(node => node.props?.["aria-current"] === "step" && textOf(node).includes("Channels")).length).toBeGreaterThan(0);
    expect(tree.root.findAll(node => node.type === "input" && node.props.type === "checkbox").length).toBeGreaterThan(0);
  });
  it("preserves radio semantics for later launch mode selection", async () => {
    const tree = await mount();
    await act(async () => { findButtonByText(tree.root, "Continue").props.onClick(); });
    await act(async () => { findButtonByText(tree.root, "Continue").props.onClick(); });
    expect(tree.root.findAll(node => node.type === "input" && node.props.type === "radio").length).toBeGreaterThan(0);
  });
  it("retains redacted plugin readiness for the existing later launch flow", () => {
    expect(buildStream555SetupSummary(createReadyPlugin()).setupRequired).toBe(false);
  });
  it("keeps the go-live modal body bounded and scrollable on short viewports", () => {
    const cssFiles = [
      readFileSync(
        resolve(
          process.cwd(),
          "packages/app-core/src/styles/alice-companion.css",
        ),
        "utf8",
      ),
      readFileSync(
        resolve(process.cwd(), "packages/app-core/src/styles/styles.css"),
        "utf8",
      ),
    ];

    for (const css of cssFiles) {
      expect(css).toContain("92dvh");
      expect(css).toContain("100dvh - 1rem");
      expect(css).toMatch(
        /\.go-live-modal__shell\s*\{[\s\S]*?min-height: 0;[\s\S]*?height: 100%;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__header\s*\{[\s\S]*?flex: 0 0 auto;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__body\s*\{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?scroll-padding-bottom: 2rem;[\s\S]*?scrollbar-gutter: stable;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__setup-card\s*\{[\s\S]*?min-height: 8rem;/,
      );
      expect(css).toMatch(
        /\.go-live-modal__footer\s*\{[\s\S]*?flex: 0 0 auto;/,
      );
      expect(css).toMatch(
        /@media \(max-height: 760px\) and \(min-width: 721px\) \{[\s\S]*?\.go-live-modal__mode-card\s*\{[\s\S]*?min-height: 8\.8rem;/,
      );
    }
  });
});
