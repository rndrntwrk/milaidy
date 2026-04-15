/**
 * Broadcast shell — chrome-free render of CompanionSceneHost intended for
 * the capture-service's headless Chromium to grab as the "camera" frame
 * when Alice goes live.
 *
 * Activation: visit the app root with `?broadcast` (any non-`false`/`0`
 * value) on the URL. App.tsx's `useIsBroadcast()` gate routes the boot
 * here instead of the regular shell.
 *
 * Why this is the right capture target:
 * - It mounts the same `<CompanionSceneHost active>` the user sees on the
 *   companion tab, so VRM model, scene preset, idle animations, and any
 *   future overlay (chat bubbles, action bubbles) stay in lockstep with
 *   the live AppContext state. No double-maintenance against a parallel
 *   renderer.
 * - It does NOT mount Header, hub navigation, sidebars, settings panels,
 *   or chat dock. The viewport is a clean full-bleed stage suitable for
 *   1920x1080 RTMPS capture.
 * - Pointer events are disabled (`interactive={false}`) so an automated
 *   capture pipeline can't accidentally trigger UI affordances by hovering
 *   the cursor over the scene.
 *
 * The companion tab on the regular shell still uses the normal
 * `<CompanionShell />` and is unchanged by this component.
 */

import { useRenderGuard } from "@miladyai/app-core/hooks";
import { memo } from "react";
import { CompanionSceneHost } from "../companion/CompanionSceneHost";

export const BroadcastShell = memo(function BroadcastShell() {
  useRenderGuard("BroadcastShell");
  return (
    <div
      data-broadcast-shell
      className="fixed inset-0 h-screen w-screen overflow-hidden bg-black"
    >
      <CompanionSceneHost active interactive={false} />
    </div>
  );
});
