# Pro Streamer Work Audit — 2026-03-10

## Scope
- Branch: `feature/milady-os-v3.7-hud`
- Audit basis:
  - Landed branch work through commit `33ef1af5`
  - Current working tree changes not yet committed
- Focus area:
  - Milady / Pro Streamer HUD
  - control stack and vault routing
  - icon and avatar defaults
  - 555 Stream / 555 Arcade live controls
  - Alice camera-hold stage composition

## Complete

### 1. HUD routing and modal state are now centralized
- Shared routing contract exists in `apps/app/src/miladyHudRouting.ts`.
- `AppContext`, `ControlStackModal`, `AssetVaultDrawer`, `MiladyOsDashboard`, `OpsDrawer`, `CommandPalette`, and `navigation.ts` consume the same Milady HUD routing rules.
- `apps` visibility is now gated consistently through the shared routing contract.
- `AdvancedPageView` no longer drops `security`; `security` is wired as a real rendered destination.
- Dead HUD-only control-stack state was removed instead of being kept alive by fake consumers.

### 2. Pro Streamer icon and model pass is landed
- Theme-scoped professional SVG icons replaced the prior emoji/glyph usage for the Pro Streamer experience.
- Brand/company icons are resolved through `apps/app/src/proStreamerBrandIcons.ts` and only applied when the Pro Streamer theme is active.
- Default Pro Streamer VRM is now `apps/app/public/vrms/alice.vrm`.
- Alice is wired as the default built-in avatar selection for the Pro Streamer branch.

### 3. Quick-layer live actions are no longer owned by `ChatView`
- Canonical quick-layer execution now lives in `apps/app/src/AppContext.tsx`.
- Shared quick-layer support/runtime helpers exist in:
  - `apps/app/src/quickLayerSupport.ts`
  - `apps/app/src/quickLayerRuntime.ts`
- `ChatView`, `CustomActionsView`, `CustomActionsPanel`, and the Pro Streamer dashboard all call the same `runQuickLayer(...)` path.
- The previous `milaidy:quick-layer:run` dependency on `ChatView` being mounted is removed.

### 4. Alice live composition state exists and is used
- Shared composition helpers exist in `apps/app/src/liveComposition.ts`.
- Canonical rules are now implemented:
  - no secondary source -> `camera-full` -> `default`
  - any active secondary source -> `camera-hold` -> `active-pip`
  - latest active secondary source wins hero priority
- App state now tracks:
  - broadcast state
  - live layout mode
  - live scene id
  - active secondary sources
  - resolved hero source

### 5. 555 Stream / 555 Arcade live flows honor the layout contract
- `src/plugins/stream555-control/index.ts` now accepts `layoutMode` and resolves scene ids through the shared camera-full / camera-hold mapping.
- `src/plugins/five55-games/index.ts` now threads the same layout intent through `FIVE55_GAMES_GO_LIVE_PLAY`.
- Alice app/game go-live flows no longer rely on raw `scene: "game"` for the Pro Streamer behavior.

### 6. Pro Streamer dashboard now owns primary live controls
- `apps/app/src/components/MiladyOsDashboard.tsx` includes a compact live tray for:
  - `Go Live`
  - `Screen Share`
  - `Play Games`
  - `Ads`
  - `Reaction`
  - `End Live`
  - resume/open current game
- `apps/app/src/components/MiladyStatusStrip.tsx` now reflects:
  - on-air / off-air
  - camera-full / camera-hold
  - current hero source label

### 7. Stage composition now matches the Alice camera-hold requirement
- `apps/app/src/components/ProStreamerStageComposition.tsx` is added as the stage compositor.
- `apps/app/src/components/AgentCore.tsx` now renders through that compositor.
- Current behavior:
  - Alice camera is full-stage when there is no secondary source
  - active game feed becomes the large hero frame when present
  - Alice camera moves into the hold window during camera-hold mode
  - non-local hero sources without a renderable URL show an intentional hero placeholder instead of incorrect content

### 8. Shared Stream / Arcade operator panels exist
- `apps/app/src/components/PluginOperatorPanels.tsx` now contains reusable Stream555 and Arcade555 operator panels.
- `OpsDrawer` consumes those panels.
- `PluginsView` renders the shared operator panels for the live cards it exposes.

## Verification Completed

### Passed
- `bunx vitest run --config apps/app/vitest.config.ts apps/app/test/liveComposition.test.ts apps/app/test/app/chat-quick-layers.test.ts apps/app/test/app/milady-os-dashboard-smoke.test.tsx apps/app/test/MiladyNavigation.test.tsx apps/app/test/app/custom-actions-panel.test.tsx apps/app/test/app/plugins-view-stream555-operator-controls.test.ts apps/app/test/app/plugins-view-arcade555-operator-controls.test.ts`
- `bunx vitest run src/plugins/stream555-control/index.test.ts src/plugins/five55-games/index.test.ts`
- `bunx vitest run --config apps/app/vitest.config.ts apps/app/test/ProStreamerStageComposition.test.tsx apps/app/test/app/milady-os-dashboard-smoke.test.tsx apps/app/test/liveComposition.test.ts`

### Known non-blocking verification gap
- `../../node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json` still fails on pre-existing unrelated repo issues outside this pass.
- Current repeated unrelated failures include files such as:
  - `apps/app/src/components/AdvancedModalWrapper.tsx`
  - `apps/app/src/components/avatar/VrmEngine.ts`
  - `apps/app/src/components/BugReportModal.tsx`
  - `apps/app/src/components/RuntimeHealthPanel.tsx`
  - `src/config/types.milady.ts`

## Remaining TODO

### P1. Reconcile `GameViewOverlay` with the new in-stage hero
- `apps/app/src/App.tsx` still mounts `GameViewOverlay` whenever `activeGameViewerUrl && gameOverlayEnabled && tab !== "apps"`.
- In Pro Streamer mode, the dashboard now already renders the active game feed in-stage.
- Result: the old overlay path can still duplicate or fight the stage hero on Milady / Pro Streamer.
- Recommended follow-up:
  - suppress `GameViewOverlay` when `currentTheme === "milady-os"`, or
  - split overlay intent from stage intent so only one viewer surface is active at a time.

### P1. Screen-share, guest, and web hero feeds still lack real preview surfaces
- The composition policy is implemented, but only sources with a local renderable URL currently show a real hero frame.
- `screen-share` currently promotes Alice into hold and marks the hero source correctly, but the stage falls back to a placeholder because there is no local preview URL.
- Guest invite also does not create a hero source by design; only an actual guest feed should do that.

### P2. `PluginsView` still has duplicate operator/helper definitions
- Shared operator panels now exist in `PluginOperatorPanels.tsx`, and the runtime uses them where intended.
- `PluginsView.tsx` still contains duplicate exported helper/panel implementations alongside the shared module.
- This is no longer the runtime source of truth for the rendered operator cards in the updated call sites, but the file cleanup is incomplete.
- Recommended follow-up:
  - remove the remaining duplicated Stream555 / Arcade555 helper and panel code from `PluginsView.tsx`
  - keep `PluginOperatorPanels.tsx` as the canonical home

### P2. Multi-source hero selection is automatic but not operator-selectable
- Current rule is correct for default behavior: the latest active secondary source wins.
- There is no explicit operator UI yet to pin or switch hero source when multiple secondary feeds are active at once.

### P3. Guest/video ingestion is not implemented yet
- `STREAM555_GUEST_INVITE` exists as an action path, but there is no guest media feed registration path yet.
- Future guest inputs should register as real `LiveSecondarySource` entries once an actual feed is connected.

### P3. Full repo type hygiene remains out of scope
- The current branch still has unrelated app/package type issues outside the Pro Streamer work.
- That cleanup should be tracked separately from the Milady HUD and live-controls initiative.

## Suggested Next Execution Order
1. Fix the Milady `GameViewOverlay` duplication path in `App.tsx`.
2. Introduce renderable preview/media handles for screen-share and future guest feeds.
3. Remove the remaining duplicate Stream555 / Arcade555 helper code from `PluginsView.tsx`.
4. Add optional operator control for pinning the hero source when multiple feeds are live.

## Audit Summary
- The HUD routing work is complete.
- The Pro Streamer icon and Alice avatar default work is complete.
- The live control ownership move from `ChatView` to `AppContext` is complete.
- The Alice camera-hold stage behavior is implemented and tested.
- The remaining work is mostly cleanup and feed-surface completion, not core architecture uncertainty.
