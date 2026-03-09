/**
 * Plugins view — single unified plugin management surface.
 */

import { PluginsView } from "./PluginsView";
import { ControlStackSectionFrame } from "./ControlStackSectionFrame.js";

export function PluginsPageView() {
  return (
    <ControlStackSectionFrame
      title="Plugins"
      description="Plugin lifecycle, readiness, and connector capability management for the active node."
      badge="Integration"
    >
      <PluginsView />
    </ControlStackSectionFrame>
  );
}
