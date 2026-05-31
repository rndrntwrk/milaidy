import type { OverlayAppContext } from "../apps/overlay-app-api";
import { CompanionView } from "../pages/CompanionView";

/**
 * Full-screen overlay app wrapper for the canonical companion route.
 *
 * Keep this as a thin adapter so `/companion` and overlay-launched companion
 * share the same Alice controls: VRM stage, Go Live, stage actions, and docked
 * chat. Reimplementing the shell here regressed the Alice-specific surfaces
 * during the upstream pull.
 */
export function CompanionAppView(_props: OverlayAppContext) {
  return (
    <div
      className="fixed inset-0 z-50 h-screen min-h-0 w-full overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <CompanionView />
    </div>
  );
}
