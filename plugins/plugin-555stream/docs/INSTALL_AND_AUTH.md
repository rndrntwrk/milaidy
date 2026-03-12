# 555 Stream — Install and Auth

This document defines the supported install and auth paths for public operators.

## Install targets

Supported hosts:
- Milaidy
- elizaOS runtimes that load package plugins

Package:

```bash
bun add @rndrntwrk/plugin-555stream
```

```bash
npm install @rndrntwrk/plugin-555stream
```

## Required runtime inputs

## Base URL model

Operators should not need to choose a base URL in the normal setup path.

The plugin supports:
- `STREAM555_PUBLIC_BASE_URL` for external/public agents
- `STREAM555_INTERNAL_BASE_URL` for internal allow-listed agents
- `STREAM555_INTERNAL_AGENT_IDS` to decide who gets the internal route

Legacy:
- `STREAM555_BASE_URL` remains supported as an override

Recommended public setup:

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
```

## Auth model

### Preferred
- `STREAM555_AGENT_API_KEY`

This allows the plugin to exchange for short-lived JWTs and refresh them before expiry.

### Fallback
- `STREAM555_AGENT_TOKEN`
- `STREAM_API_BEARER_TOKEN`

Use the static bearer path only when API-key exchange is unavailable.

## Wallet auth model

Wallet auth exists for the Milaidy operator experience and approval-bound auth flows.

Preferred chain:
- Solana first

Fallback:
- Ethereum

Provisioning:
- `sw4p`-linked provisioning is allowed only when no runtime wallet exists and the host/operator explicitly enables it

Relevant keys:
- `STREAM555_WALLET_AUTH_PREFERRED_CHAIN`
- `STREAM555_WALLET_AUTH_ALLOW_PROVISION`
- `STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN`

## Minimal install profiles

## Profile A — Public go-live

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_REQUIRE_APPROVALS=true
```

## Profile B — Public go-live with fixed session

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_DEFAULT_SESSION_ID=<session-id>
STREAM555_REQUIRE_APPROVALS=true
```

## Profile C — Internal Alice-style runtime

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_INTERNAL_BASE_URL=http://control-plane:3000
STREAM555_INTERNAL_AGENT_IDS=alice,alice-internal
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_DEFAULT_SESSION_ID=<session-id>
STREAM555_REQUIRE_APPROVALS=true
```

## Channel configuration keys

Each supported channel uses:
- enabled toggle
- RTMP/RTMPS URL
- stream key

Supported built-in channels:
- Pump.fun
- X
- Twitch
- Kick
- YouTube
- Facebook
- Custom

Examples:

```env
STREAM555_DEST_TWITCH_ENABLED=true
STREAM555_DEST_TWITCH_RTMP_URL=rtmps://ingest.global-contribute.live-video.net/app
STREAM555_DEST_TWITCH_STREAM_KEY=<secret>
```

```env
STREAM555_DEST_CUSTOM_ENABLED=true
STREAM555_DEST_CUSTOM_RTMP_URL=rtmps://example.invalid/live
STREAM555_DEST_CUSTOM_STREAM_KEY=<secret>
```

## Security rules

- never commit API keys, bearer tokens, or stream keys
- keep approvals on in production
- prefer API-key exchange because the plugin can refresh it
- treat channel keys as operator secrets, not agent memory
- only expose internal base URLs to allow-listed agents

## Milaidy behavior

In Milaidy:
- internal/public URL routing is automatic
- secrets are stored obfuscated in the operator UI
- a saved channel config should remain persisted when the field is hidden again

## Related docs

- `OPERATOR_SETUP_MATRIX.md`
- `MILAIDY_WEB_ACCESS.md`
