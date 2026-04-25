# Farcaster Connector

Connect your agent to the Farcaster decentralized social protocol for casting, replies, and channel participation using the `@elizaos/plugin-farcaster` package.

## Prerequisites

- A Farcaster account with a known FID
- A [Neynar](https://neynar.com) API key
- A Neynar signer UUID associated with your Farcaster account

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `FARCASTER_NEYNAR_API_KEY` | Yes | Neynar API key for authentication |
| `FARCASTER_FID` | Yes | Farcaster ID (FID) of the agent account |
| `FARCASTER_SIGNER_UUID` | Yes | Neynar signer UUID for signing casts |
| `FARCASTER_HUB_URL` | No | Farcaster hub URL (default: `hub.pinata.cloud`) |
| `FARCASTER_MODE` | No | Operation mode: `polling` or `webhook` (default: `polling`) |
| `FARCASTER_POLL_INTERVAL` | No | Polling interval in seconds (default: `120`) |
| `FARCASTER_DRY_RUN` | No | Simulate operations without executing them |
| `ENABLE_CAST` | No | Enable posting casts (default: `true`) |
| `CAST_IMMEDIATELY` | No | Post immediately instead of on schedule (default: `false`) |
| `CAST_INTERVAL_MIN` | No | Minimum minutes between autonomous casts (default: `90`) |
| `CAST_INTERVAL_MAX` | No | Maximum minutes between autonomous casts (default: `180`) |
| `MAX_CAST_LENGTH` | No | Maximum characters per cast (default: `320`) |
| `ENABLE_ACTION_PROCESSING` | No | Enable automated action processing (default: `false`) |
| `ACTION_INTERVAL` | No | Minutes between action-processing cycles (default: `5`) |
| `MAX_ACTIONS_PROCESSING` | No | Maximum actions per batch (default: `1`) |

These can be set as environment variables or under the `connectors.farcaster` config in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345
    }
  }
}
```

The connector auto-enables when `apiKey` is truthy in the connector config and `enabled` is not explicitly `false`.

## Setup

1. Create a Farcaster account if you don't have one.
2. Sign up at [Neynar](https://neynar.com) and obtain an API key.
3. Create a signer via the Neynar dashboard and note the signer UUID.
4. Add the credentials to `connectors.farcaster` in your config or set the environment variables.
5. Start your agent -- the Farcaster connector will auto-enable.

## Features

- **Autonomous casting** -- Posts in the agent's voice at configurable intervals
- **Replies** -- Responds to @mentions and replies to the agent's casts
- **Reactions** -- Likes and recasts
- **Channel monitoring** -- Participates in Farcaster channels
- **Direct casts** -- Private DM-like messages (Warpcast feature)
- **On-chain identity** -- Agent identity is tied to an Ethereum address
- **Thread splitting** -- Messages over 320 characters are split into cast threads

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
