---
title: Alice On Develop Operator Note
description: Quick operator reference for Alice identity, stream, and arcade surfaces on the develop-based integration stack.
---

# Alice on Develop Operator Note

This integration keeps the current `develop` shell, onboarding flow, and 3D environment authoritative while restoring Alice identity, streaming runtime support, and arcade runtime support inside those existing surfaces.

## Alice Identity

- Alice is bundled as roster avatar `9`.
- Alice becomes the default companion only when avatar state is unset or invalid.
- Existing saved avatar choices are preserved.
- Custom avatar `0` is preserved.

## Stream Surface

- Streaming remains in the current shell's **Stream** tab.
- Destination selection lives in the current stream status bar.
- Go-live behavior uses the restored `555stream` runtime bridge rather than legacy Alice HUD chrome.

## Arcade Surface

- Arcade remains inside the current app shell.
- When the `five55-games` runtime is active, game app detail panes show an **Alice Arcade** operator card for catalog refresh, play, switch, and stop actions.
- No legacy Alice stage shell or arcade HUD is restored in this integration.

## Required Stream Prerequisites

- `STREAM555_BASE_URL` must be configured for the agent runtime.
- One of these auth paths must be configured:
  - `STREAM555_AGENT_TOKEN`
  - `STREAM555_AGENT_API_KEY`
- The vendored `@rndrntwrk/plugin-555stream` package must be present in the workspace so current runtime resolution can load the plugin source tree.
