import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");

describe("Alice companion stage integration", () => {
  it("wires Alice Go Live and stage actions into the active companion route", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "CompanionView.tsx"),
      "utf8",
    );

    expect(source).toContain("useCompanionStageOperator");
    expect(source).toContain("CompanionStageOperatorOverlay");
    expect(source).toContain("AliceGoLiveHeaderControl");
    expect(source).toContain('data-testid="companion-header-go-live"');
  });

  it("keeps the left action pill, expandable action panel, and bottom chat dock", () => {
    const companionSource = fs.readFileSync(
      path.join(__dirname, "CompanionView.tsx"),
      "utf8",
    );
    const overlaySource = fs.readFileSync(
      path.join(__dirname, "../operator/CompanionStageOperatorOverlay.tsx"),
      "utf8",
    );
    const sharedStyles = fs.readFileSync(
      path.join(repoRoot, "packages/app-core/src/styles/styles.css"),
      "utf8",
    );

    expect(companionSource).toContain("companion-chat-dock");
    expect(companionSource).toContain("<CompanionShell");
    expect(overlaySource).toContain("BubbleActionButton");
    expect(overlaySource).toContain("DialogDescription");
    expect(overlaySource).toContain(
      'data-testid="companion-stage-actions-launcher"',
    );
    expect(overlaySource).toContain(
      'data-testid="companion-stage-actions-bubble"',
    );
    expect(overlaySource).toContain("aria-expanded={expanded}");
    expect(overlaySource).toContain('id="alice-stage-actions-panel"');
    expect(overlaySource).toContain("!h-[calc(100dvh-6rem)]");
    expect(overlaySource).toContain("overflow-y-auto overscroll-contain");
    expect(overlaySource).not.toContain("hidden -translate-y-1/2 md:block");
    expect(sharedStyles).toContain(".companion-stage-overlay");
    expect(sharedStyles).toContain(
      'body:has([data-testid="companion-stage-actions-bubble"]) .companion-chat-dock',
    );
    expect(sharedStyles).toContain("@media (max-width: 767px)");
  });

  it("does not block the companion shell on bundled VRM prefetch", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "CompanionShell.tsx"),
      "utf8",
    );

    expect(shellSource).toContain("<CompanionView />");
    expect(shellSource).not.toContain("vrmsReady");
    expect(shellSource).not.toContain("Promise.allSettled");
    expect(shellSource).not.toContain('LoadingScreen phase="ready"');
    expect(shellSource).not.toContain("getVrmUrl(1)");
  });

  it("uses Alice as the companion viewer fallback avatar", () => {
    const viewerSource = fs.readFileSync(
      path.join(__dirname, "../avatar/VrmViewer.tsx"),
      "utf8",
    );

    expect(viewerSource).toContain("getDefaultBundledVrmIndex");
    expect(viewerSource).toContain("getVrmUrl(getDefaultBundledVrmIndex())");
    expect(viewerSource).not.toContain("getVrmUrl(1)");
  });

  it("keeps Alice identity attached to live capture launch paths", () => {
    const operatorSource = fs.readFileSync(
      path.join(__dirname, "../operator/useCompanionStageOperator.ts"),
      "utf8",
    );
    const streamControlSource = fs.readFileSync(
      path.join(repoRoot, "src/plugins/stream555-control/index.ts"),
      "utf8",
    );
    const legacyStreamSource = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/plugin-555stream/src/actions/legacyCompat.ts",
      ),
      "utf8",
    );

    expect(operatorSource).toContain('avatarIdentity: "alice"');
    expect(operatorSource).toContain(
      'params: { sceneId: "active-pip", avatarIdentity: "alice" }',
    );
    expect(streamControlSource).toContain("buildStreamStartOptions");
    expect(streamControlSource).toContain('"avatarIdentity"');
    expect(legacyStreamSource).toContain(
      "optionString(options, 'avatarIdentity')",
    );
    expect(legacyStreamSource).toContain(
      "options: { scene, ...(avatarIdentity ? { avatarIdentity } : {}) }",
    );
  });

  it("routes the overlay app through the same Alice companion surface", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "CompanionAppView.tsx"),
      "utf8",
    );

    expect(source).toContain('import { CompanionView } from "./CompanionView"');
    expect(source).toContain("<CompanionView />");
  });

  it("uses the restored Alice camera defaults instead of the close-up crop", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "CompanionSceneHost.tsx"),
      "utf8",
    );
    const parentStageState = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/app-core/src/components/companion/companion-stage-state.ts",
      ),
      "utf8",
    );
    const agentStageRoutes = fs.readFileSync(
      path.join(repoRoot, "packages/agent/src/api/misc-routes.ts"),
      "utf8",
    );
    const nestedApiServer = fs.readFileSync(
      path.join(repoRoot, "eliza/packages/app-core/src/api/server.ts"),
      "utf8",
    );

    expect(source).toContain(
      'const COMPANION_ZOOM_STORAGE_KEY = "eliza.companion.zoom.v2"',
    );
    expect(source).toContain("const DEFAULT_COMPANION_ZOOM = 0.25");
    expect(parentStageState).toContain("zoom: 0.25");
    expect(agentStageRoutes).toContain("zoom: 0.25");
    expect(nestedApiServer).toContain("zoom: 0.25");
  });

  it("renders Alice backdrop as one blurred non-repeating stage image", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "VrmStage.tsx"),
      "utf8",
    );

    expect(source).toContain('backgroundRepeat: "no-repeat"');
    expect(source).toContain('backgroundSize: "cover"');
    expect(source).toContain("blur(18px)");
    expect(source).toContain("{!backgroundImageUrl && (");
  });
});
