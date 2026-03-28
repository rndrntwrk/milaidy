# 555 Stream — Operator Setup Matrix

This is the config and deployment matrix for the canonical public stream plugin.

## Minimum production setup

| Key | Required | Preferred value | Notes |
| --- | --- | --- | --- |
| `STREAM555_PUBLIC_BASE_URL` | Yes | `https://stream.rndrntwrk.com` | Public control-plane URL |
| `STREAM555_AGENT_API_KEY` | Preferred | `<secret>` | Preferred auth path |
| `STREAM555_AGENT_TOKEN` | Fallback | `<secret>` | Static bearer fallback |
| `STREAM555_REQUIRE_APPROVALS` | Yes | `true` | Keep enabled in production |

## Common additions

| Key | When to use |
| --- | --- |
| `STREAM555_DEFAULT_SESSION_ID` | Reuse a stable session |
| `STREAM_SESSION_ID` | One-off session override |
| `STREAM555_INTERNAL_BASE_URL` | Internal-only agents |
| `STREAM555_INTERNAL_AGENT_IDS` | Identify which agents get the internal route |

## Wallet auth options

| Key | Default | Purpose |
| --- | --- | --- |
| `STREAM555_WALLET_AUTH_PREFERRED_CHAIN` | `solana` | Solana-first wallet auth |
| `STREAM555_WALLET_AUTH_ALLOW_PROVISION` | `true` | Allow `sw4p` wallet provisioning when needed |
| `STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN` | `eth` | Provisioning fallback chain |

## Channels

Each built-in channel supports:
- `_ENABLED`
- `_RTMP_URL`
- `_STREAM_KEY`

Built-in channel families:
- `STREAM555_DEST_PUMPFUN_*`
- `STREAM555_DEST_X_*`
- `STREAM555_DEST_TWITCH_*`
- `STREAM555_DEST_KICK_*`
- `STREAM555_DEST_YOUTUBE_*`
- `STREAM555_DEST_FACEBOOK_*`
- `STREAM555_DEST_CUSTOM_*`

## Recommended profiles

### Public operator

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_REQUIRE_APPROVALS=true
```

### Public operator with stable session

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_DEFAULT_SESSION_ID=<session-id>
STREAM555_REQUIRE_APPROVALS=true
```

### Internal agent

```env
STREAM555_PUBLIC_BASE_URL=https://stream.rndrntwrk.com
STREAM555_INTERNAL_BASE_URL=http://control-plane:3000
STREAM555_INTERNAL_AGENT_IDS=alice,alice-internal
STREAM555_AGENT_API_KEY=<agent-api-key>
STREAM555_REQUIRE_APPROVALS=true
```

## Operational expectations

- channels can be saved before they are enabled
- enabled channels should be fully configured before go-live
- app capture should use `STREAM555_GO_LIVE_APP`
- normal studio capture should use `STREAM555_STREAM_START`

## Security baseline

- do not commit API keys or stream keys
- treat internal base URLs as private infrastructure
- keep approvals on for public release
- prefer API-key exchange over static bearer
