# @rndrntwrk/plugin-555stream

Canonical elizaOS/Milaidy plugin for `555 Stream` live operations.

Status: public preview (`0.1.0-beta.1`).

This package owns the public streaming surface for:
- authentication and session bootstrap
- channel configuration and go-live
- ads and monetization controls
- studio scenes, graphics, templates, alerts, guests, chat, media, and radio

It is the plugin that agents and operators should install when they need to go live through the 555 stack. Milaidy is the host. This package owns the stream-specific behavior, config schema, UI schema, actions, and skills.

## Primary use cases

- authenticate an agent against the 555 Stream control plane
- configure one or more channel outputs and go live
- run app capture or composition/screen/camera inputs
- trigger L-bar ads and recover cleanly from approval-gated stop flows
- control studio state without shell access

## Canonical public docs

- [Open docs.rndrntwrk.com](https://docs.rndrntwrk.com/555stream)

## Repo reference docs

- `docs/PLUGIN_PUBLIC_STANDARD.md`
- `docs/PUBLISHING.md`
- `docs/RELEASE_NOTES_0.1.0-beta.1.md`
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

## Install

```bash
bun add @rndrntwrk/plugin-555stream
```

```bash
npm install @rndrntwrk/plugin-555stream
```

## Minimal setup

Preferred auth path:
- `STREAM555_AGENT_API_KEY` for token exchange and refresh

Static fallback:
- `STREAM555_AGENT_TOKEN`

Required routing:
- `STREAM555_PUBLIC_BASE_URL` for public agents
- `STREAM555_INTERNAL_BASE_URL` only for allow-listed internal agents such as Alice

Minimal example:

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_REQUIRE_APPROVALS=true
```

## 3-step path

1. `STREAM555_HEALTHCHECK`
2. `STREAM555_BOOTSTRAP_SESSION`
3. Configure channels, then `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP`

Use `docs/GET_STARTED.md` for the operator walkthrough.

## Operator state model

The public UI and API should treat these as distinct:

| State | Meaning |
| --- | --- |
| `installed` | Package is present in the host runtime |
| `enabled` | Host policy allows the plugin to load |
| `loaded` | Service started successfully |
| `authenticated` | HTTP auth is valid |
| `ready` | Session is bound and the plugin can perform stream work |

Channel readiness is separate:

| State | Meaning |
| --- | --- |
| `channelsSaved` | channel credentials exist |
| `channelsEnabled` | one or more channels are toggled on |
| `channelsReady` | enabled channels are fully configured for sync/go-live |

## Action families

- Connection: healthcheck, bootstrap, status
- Go-live: start, stop, fallback, app list, go-live app
- Channels: configure, enable, sync
- Monetization: ads and alerts
- Studio: layout, scene, state patch, graphics, templates, overlays
- Conversation: chat, guests
- Media: upload/import/delete
- Audio: radio config/control
- Compatibility: legacy `STREAM555_*` aliases kept for migration safety

See `docs/ACTIONS_REFERENCE.md` for the full action list.

## Skills

- `skills/stream-operator/SKILL.md`
- `skills/openclaw/SKILL.md`

## Public readiness boundary

What this package is responsible for:
- stream auth/session/channel/go-live/ad control
- stream-specific operator UX metadata
- stream-specific action coverage
- stream approval exposure

What this package does not own:
- arcade gameplay orchestration (`@rndrntwrk/plugin-555arcade`)
- Milaidy host install/enable plumbing
- deploy logic in `555-bot`

## Release status

Use `docs/COVERAGE_AND_GAPS.md` and `docs/PUBLIC_RELEASE_CHECKLIST.md` before publishing.
