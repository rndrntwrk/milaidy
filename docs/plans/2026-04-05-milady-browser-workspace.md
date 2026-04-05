# Milady Browser Workspace

## Decision

Do not model this as "Milady web app embeds a webpage in an iframe and the agent talks to it over postMessage."

Use a desktop-owned browser workspace instead:

- Electrobun owns real browser tabs as isolated `BrowserWindow`s
- Tabs can be shown or hidden without being destroyed
- The embedded agent runtime controls those tabs through a loopback bridge
- Milady app UI can later consume the same agent/API surface

## Why iframe is the wrong primitive

- Cross-origin iframe control is intentionally limited
- External wallet injection needs a privileged shell/webview boundary
- Background tab persistence and shared session partitions belong in the desktop host
- Agent control needs a stable automation surface even when the Milady view is closed

## Current slice

- `apps/app/electrobun/src/native/browser-workspace.ts`
  Manages hidden/showable browser tabs.
- `apps/app/electrobun/src/browser-workspace-bridge-server.ts`
  Exposes loopback-only control endpoints for the embedded agent runtime.
- `packages/agent/src/services/browser-workspace.ts`
  Shared agent-side client for the bridge.
- `packages/agent/src/api/browser-workspace-routes.ts`
  Exposes the feature on Milady's API surface.
- `packages/app-core/src/components/pages/BrowserWorkspaceView.tsx`
  Web browser workspace UI with persistent iframe tabs.
- `packages/app-core/src/components/browser/BrowserWorkspaceWalletPanel.tsx`
  Steward signing rail beside the browser workspace.
- `plugins/plugin-milady-browser`
  Local elizaOS plugin for browser and Steward wallet actions/providers.

## Follow-up work

- Add richer page introspection beyond raw JS eval/screenshot
- Add true in-page wallet-provider injection for external dapps via desktop shell or extension bridge
