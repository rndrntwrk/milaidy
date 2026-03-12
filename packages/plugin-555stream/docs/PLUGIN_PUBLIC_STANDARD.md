# 555 Stream Public Standard

This document defines the public-release standard for `@rndrntwrk/plugin-555stream`.

Use it as the source of truth for:
- package shape
- Milaidy hosting expectations
- operator-facing state vocabulary
- required docs and skills
- release gate expectations

## Scope

`555 Stream` is the canonical first-party plugin for:
- authentication and session bootstrap
- channel configuration and go-live
- ad operations and monetization
- stream-facing studio controls

It is not the gameplay plugin. Gameplay belongs to `@rndrntwrk/plugin-555arcade`.

## Required package surface

The package should ship and maintain:

- `README.md`
- `config/plugin-config.schema.json`
- `config/plugin-ui.schema.json`
- `docs/GET_STARTED.md`
- `docs/INSTALL_AND_AUTH.md`
- `docs/ACTIONS_REFERENCE.md`
- `docs/STATES_AND_TRANSITIONS.md`
- `docs/COMPLEX_FLOWS.md`
- `docs/EDGE_CASES_AND_RECOVERY.md`
- `docs/COVERAGE_AND_GAPS.md`
- `docs/PUBLIC_RELEASE_CHECKLIST.md`
- `docs/WIP_TODO.md`
- `docs/QUICKSTART_3_STEPS.md`
- `docs/OPERATOR_SETUP_MATRIX.md`
- `docs/MILAIDY_WEB_ACCESS.md`
- `skills/stream-operator/SKILL.md`
- `skills/openclaw/SKILL.md`

Historical docs may stay, but they should either remain current or point at the canonical replacements.

## Required metadata

`package.json` should keep these accurate:

- `name`
- `repository`
- `homepage`
- `bugs`
- `elizaos.displayName`
- `elizaos.configSchemaFile`
- `elizaos.pluginUiSchemaFile`

## Required operator state vocabulary

The public UI and API should use the same core lifecycle terms:

| Token | Meaning |
| --- | --- |
| `installed` | package present in the host |
| `enabled` | host policy allows the plugin to load |
| `loaded` | service/provider layer initialized |
| `authenticated` | auth is valid |
| `ready` | the primary operator flow can act |
| `degraded` | the plugin is up, but one or more dependencies are degraded |

`555 Stream` can add stream-specific secondary readiness:

| Token | Meaning |
| --- | --- |
| `channelsSaved` | channel credentials exist |
| `channelsEnabled` | one or more channels are toggled on |
| `channelsReady` | enabled channels are fully configured for sync/go-live |
| `sessionBound` | the stream session is available for control |

## Milaidy hosting boundary

Milaidy should own:
- install/enable/test plumbing
- generic plugin rendering
- generic lifecycle badges

`555 Stream` should own:
- stream config schema
- stream UI grouping
- action grouping
- stream wording
- stream readiness semantics

Milaidy should not hardcode stream-specific operator behavior when package-owned schema can express it.

## Doc rules

Public docs should:
- use canonical `555 Stream` naming
- use `Channels` in operator-facing copy
- keep base URL overrides out of primary setup flow
- keep examples secret-safe
- document approval flows and ad cooldown behavior honestly
- use relative links only

## Skill rules

The package should keep:
- one operator skill
- one OpenClaw-facing skill if OpenClaw support is claimed

Skill docs should cover:
- when to use the skill
- prerequisites
- primary workflow
- approval and safety rules
- recovery and escalation

## Release gate

`555 Stream` is not public-ready unless:
- docs are current
- skills are current
- the primary auth → session → channels → go-live path has been smoke-tested
- ad operations and stop approvals are documented accurately
- known gaps are explicitly listed in `docs/COVERAGE_AND_GAPS.md`
