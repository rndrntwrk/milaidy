# Discord Plugin: Cloud / Local Parity

Status of feature parity between locally-run Milady agents and cloud-provisioned agents using `@elizaos/plugin-discord`.

## Environment Variables

| Env Var | Local | Cloud | Notes |
|---------|-------|-------|-------|
| `DISCORD_API_TOKEN` | Config or `.env` | Injected at provisioning | Primary token used by the plugin |
| `DISCORD_BOT_TOKEN` | Mirrored from `DISCORD_API_TOKEN` | Mirrored from `DISCORD_API_TOKEN` | Legacy alias; both paths set it |
| `DISCORD_APPLICATION_ID` | Config, `.env`, or auto-resolved | Injected or auto-resolved | `autoResolveDiscordAppId()` fetches from Discord API if only bot token is set |

Both `applyConnectorSecretsToEnv` (runtime) and `collectConnectorEnvVars` (config/cloud provisioning) produce identical env var sets. No gaps.

## Managed Discord OAuth (Cloud)

The cloud dashboard provides a managed Discord OAuth flow:

1. **Init**: `POST /api/cloud/v1/milady/agents/:id/discord/oauth` returns `authorizeUrl` + `applicationId`
2. **Browser**: User authorizes the shared Milady Discord app and selects a server
3. **Callback**: Redirect back with `?discord=connected&managed=1&agentId=...&guildId=...&guildName=...`
4. **Consume**: `consumeManagedDiscordCallbackUrl()` parses the callback, updates UI state
5. **Disconnect**: `DELETE /api/cloud/v1/milady/agents/:id/discord` revokes the connection

The managed flow uses a shared Discord application owned by Eliza Cloud. The user who completes setup becomes the admin-locked Discord connector admin for role-gated actions.

**Local agents** use their own bot token directly (no OAuth flow needed).

## Plugin Auto-Enable

Discord is auto-enabled when `connectors.discord` has a `token` or `botToken` field set. This works identically in cloud and local via `applyPluginAutoEnable()`. Cloud-provisioned agents also get `@elizaos/plugin-edge-tts` auto-enabled for voice output.

## Connector Health Monitor

The health monitor (`ConnectorHealthMonitor`) now covers all 19 connectors including Discord, matching the full `CONNECTOR_PLUGINS` map. Cloud and local agents get identical health check coverage.

## Known Limitations

### Voice Support in Cloud Containers

Cloud container images (`Dockerfile.cloud`, `Dockerfile.ci`, `Dockerfile.cloud-slim`) use slim base images (`node:22-slim` or `node:22-bookworm-slim`) that do **not** include:

- `ffmpeg` (audio transcoding)
- `libopus-dev` / `@discordjs/opus` (Opus codec for Discord voice)
- `libsodium-dev` / `sodium-native` (encryption for voice connections)

**Impact**: Discord voice features (`joinChannel`, `leaveChannel`, `AudioMonitor`, voice transcription) will fail silently or throw at runtime in cloud containers.

**Workaround**: The plugin's voice features degrade gracefully - text-based Discord features (messages, reactions, threads, embeds, file attachments) work without voice dependencies. If voice is required in cloud, the container image must be extended with:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libopus-dev && rm -rf /var/lib/apt/lists/*
```

### Advanced Discord Configuration

The following advanced config options are supported by the plugin but **not exposed** in the cloud dashboard UI. They can be passed through `agentConfig` or `environmentVars` at provisioning time:

| Feature | Config Path | Cloud Dashboard |
|---------|------------|-----------------|
| Per-guild settings | `connectors.discord.guilds.*` | Not exposed |
| Per-channel settings | `connectors.discord.channels.*` | Not exposed |
| DM policies | `connectors.discord.dmPolicy` | Not exposed |
| PluralKit support | `connectors.discord.pluralKit` | Not exposed |
| Exec approval flow | `connectors.discord.execApprovals` | Not exposed |
| Custom intents | `connectors.discord.intents` | Not exposed |
| Action gating | `connectors.discord.actions.*` | Not exposed |
| Bot nickname | `connectors.discord.botNickname` | Exposed (input field) |

These settings pass through correctly if included in the agent config at creation time via `createCloudCompatAgent({ agentConfig: { connectors: { discord: { ... } } } })`.

### Multi-Account Discord

Local Milady supports multi-account Discord via `connectors.discord.accounts`. This is **not tested** in cloud containers and the managed OAuth flow only supports a single Discord connection per agent. Multi-account would require multiple bot tokens injected into the container environment, which the current provisioning API does not support.

### Action Gating

The `DiscordActionConfig` (enabling/disabling specific actions like `sendMessage`, `addReaction`, `createThread`, etc.) works identically in cloud and local - it is handled entirely within the plugin based on the agent config. The cloud dashboard does not expose a UI for toggling individual actions, but the config is respected if passed at provisioning.
