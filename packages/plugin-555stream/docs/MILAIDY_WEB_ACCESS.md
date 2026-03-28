# 555 Stream — Milaidy Web Access

This document defines how `555 Stream` should appear inside Milaidy.

## Plugin card expectations

The Milaidy plugin card should expose:
- canonical name: `555 Stream`
- lifecycle summary: `Installed`, `Enabled`, `Loaded`, `Authenticated`, `Ready`
- operator controls for auth and verify
- a single `Channels` group, not mixed destination terminology
- a `Session` section
- a `Monetization` section
- `Advanced` only for non-default infrastructure controls

## Default operator experience

The default operator should be able to:
1. verify auth
2. bootstrap a session
3. save channel credentials
4. enable channels
5. go live
6. trigger an ad
7. stop the stream with approval

They should not need to:
- edit raw base URLs
- understand internal/public routing
- know legacy plugin IDs

## UI state mapping

| Milaidy state | Meaning |
| --- | --- |
| `Installed` | package present |
| `Enabled` | host policy allows loading |
| `Loaded` | runtime service started |
| `Authenticated` | auth check succeeded |
| `Ready` | session is bound and stream work can execute |

## Action entrypoints from Milaidy

Expected first actions:
1. `STREAM555_HEALTHCHECK`
2. `STREAM555_BOOTSTRAP_SESSION`
3. `STREAM555_PLATFORM_CONFIG`
4. `STREAM555_PLATFORM_TOGGLE`
5. `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP`
6. `STREAM555_STREAM_STATUS`

## Web/API host notes

- Milaidy owns generic install/enable/test plumbing
- `555 Stream` owns the domain schema, labels, action grouping, and state semantics
- plugin-specific auth and channel wording should come from the plugin, not be reinvented in the host
