import type { OverlayAppContext } from "@elizaos/ui";
import { CompanionView } from "./CompanionView";

/**
 * CompanionAppView — top-level overlay app component.
 *
 * Keep the app-launched overlay on the same Alice companion surface used by
 * the direct companion shell so Go Live, stage actions, chat, and the VRM
 * scene do not drift apart.
 */
export function CompanionAppView(_props: OverlayAppContext) {
  return (
    <div
      className="fixed inset-0 z-50 h-[100vh] w-full min-h-0 overflow-hidden supports-[height:100dvh]:h-[100dvh]"
      style={{ height: "100vh", minHeight: 0 }}
    >
      <CompanionView />
    </div>
  );
}
