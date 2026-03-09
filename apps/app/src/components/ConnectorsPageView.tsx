/**
 * Connectors page — plugins view constrained to connector plugins.
 */

import { ControlStackSectionFrame } from "./ControlStackSectionFrame.js";
import { PluginsView } from "./PluginsView";

export function ConnectorsPageView() {
  return (
    <ControlStackSectionFrame
      title="Connectors"
      description="Chat, social, and relay connectors for the current stream node, with readiness and activation managed in one place."
      badge="Channels"
    >
      <PluginsView mode="connectors" />
    </ControlStackSectionFrame>
  );
}
