---
title: "First-Party Release Status"
sidebarTitle: "Release Status"
description: "Current readiness, audit status, and remaining public gaps for first-party 555 plugins."
---

# First-Party Release Status

This page records the current publication state of Milady-hosted first-party public plugins.

Current scope:

- `@rndrntwrk/plugin-555stream`
- `@rndrntwrk/plugin-555arcade`

Use this with [First-Party Public Plugin Standard](/plugins/first-party-public-standard).

Canonical public entry pages:

- [555 Stream](/plugins/555-stream)
- [555 Arcade](/plugins/555-arcade)

## Audit Summary

As of March 6, 2026:

- both plugins meet the package metadata baseline
- both plugins ship the required public docs and skills
- both plugins use canonical user-facing names
- both plugins define package-owned config and UI schema
- Milady has a published host-side standard for how these plugins should be presented

## Package Baseline Matrix

| Requirement | 555 Stream | 555 Arcade |
| --- | --- | --- |
| Canonical package name | ✅ | ✅ |
| `repository` / `homepage` / `bugs` | ✅ | ✅ |
| `elizaos.displayName` | ✅ | ✅ |
| `elizaos.configSchemaFile` | ✅ | ✅ |
| `elizaos.pluginUiSchemaFile` | ✅ | ✅ |
| `files` includes `docs`, `skills`, `config` | ✅ | ✅ |
| README standardized | ✅ | ✅ |
| Required public docs present | ✅ | ✅ |
| Operator skill present | ✅ | ✅ |
| OpenClaw skill present | ✅ | ✅ |

## Current Readiness

### 555 Stream

Ready today for:

- public operator/developer onboarding
- install/setup/auth walkthroughs
- action/state documentation
- Milaidy-hosted plugin configuration

Remaining practical gates:

- ad renderer/compositor parity sign-off against the human-facing studio path
- final pass on per-channel live-status accuracy in older control-plane builds
- public screenshots or gifs for the operator docs

### 555 Arcade

Ready today for:

- public operator/developer onboarding
- install/setup/auth walkthroughs
- session/catalog/play/switch/stop documentation
- score/leaderboard/quest documentation
- Milaidy-hosted canonical arcade surface

Remaining practical gates:

- richer progression payload examples
- role-specific guidance for advanced admin surfaces
- separate game-mastery docs outside the GA plugin setup path
- public screenshots or gifs for operator docs

## Host-State Expectation

Milady should expose the same lifecycle model for both plugins:

| Token | Meaning |
| --- | --- |
| `installed` | package present |
| `enabled` | host allows loading |
| `loaded` | service/provider layer initialized |
| `authenticated` | auth is valid |
| `ready` | primary operator flow can act |
| `degraded` | plugin is available but one or more dependencies are impaired |

Plugin-specific readiness remains valid, but should not replace the lifecycle above.

## Current Non-Goals

These are intentionally not required for current public plugin readiness:

- Alice-only mastery/certification inside the default `555 Arcade` GA setup flow
- deploy/orchestration behavior in `555-bot`
- human studio compositor design parity as a docs-only requirement

## Next Publication Steps

1. keep the plugin repos as the source of truth for package-owned docs and skills
2. keep Milady docs focused on host rules, install/enable/test behavior, and release posture
3. close the remaining practical gaps in each plugin’s `docs/COVERAGE_AND_GAPS.md`
4. add visuals only after the underlying operator surfaces are stable

## Related

- [First-Party Public Plugin Standard](/plugins/first-party-public-standard)
- [Plugin Overview](/plugins/overview)
- [Publish a Plugin](/plugins/publish)
