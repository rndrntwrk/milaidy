# Cloud Agent Environment Variables

This document lists all environment variables required or relevant for cloud-provisioned agent containers. Variables marked **Required** must be present for the feature to function; variables marked **Optional** enable additional behaviour when set.

---

## Core Cloud Identity

| Variable | Required | Description |
|---|---|---|
| `MILADY_CLOUD_PROVISIONED` | **Required** | Set to `"1"` to enable cloud-provisioned mode. Triggers EVM plugin auto-enable, wallet discovery pre-boot, and other cloud-specific paths. |
| `ELIZAOS_CLOUD_API_KEY` | Recommended | Cloud inference API key. Also gates BSC RPC public proxy — without it `managedBscRpcReady` stays false, blocking the direct-signing execution path. |

---

## Steward Wallet / Transaction Signing

These variables power the end-to-end transaction execution path via `@stwd/eliza-plugin` (`StewardService` + `STEWARD_TRANSFER` action).

| Variable | Required | Used By | Description |
|---|---|---|---|
| `STEWARD_API_URL` | **Required** | `@stwd/eliza-plugin` StewardService, `stewardEvmPreBoot()`, `isStewardCloudProvisioned()` | Base URL of the Steward API (e.g. `https://steward.example.com`). Must include scheme and no trailing slash. Setting this env var also triggers `@stwd/eliza-plugin` to be auto-enabled in the agent runtime. |
| `STEWARD_API_KEY` | **Required** | `@stwd/eliza-plugin` StewardService | X-Api-Key credential used by the plugin's `StewardService` to authenticate against the Steward API. Required for `STEWARD_TRANSFER` action and wallet info fetch. |
| `STEWARD_AGENT_TOKEN` | **Required** | `steward-evm-account.ts`, `stewardEvmPreBoot()` | Bearer JWT issued per-agent. Used by the EVM bridge (`steward-evm-account.ts`) to authenticate signing requests. Must be injected at container launch — one token per agent instance. |
| `STEWARD_AGENT_ID` | Optional | Steward agent lookup | Steward agent identifier. Usually embedded as the `sub` claim of `STEWARD_AGENT_TOKEN`; only needed separately if the JWT doesn't carry it. |
| `STEWARD_TENANT_ID` | Optional | Multi-tenant Steward deployments | Tenant scoping for multi-tenant Steward API setups. Omit for single-tenant. |
| `STEWARD_AUTO_REGISTER` | Optional | `@stwd/eliza-plugin` StewardService | Set to `"1"` to have the plugin auto-register the agent with Steward on first boot if no wallet exists. |
| `STEWARD_FALLBACK_LOCAL` | Optional | `@stwd/eliza-plugin` StewardService | Set to `"1"` to fall back to local signing if Steward is unavailable. Not recommended for production cloud containers. |

### Auth Scheme Note

There is currently a split in authentication between the two Steward integration paths:

- **`@stwd/eliza-plugin` (StewardService)** uses `STEWARD_API_KEY` (`X-Api-Key` header) — this is the primary cloud path enabled by `STEWARD_API_URL` auto-enable.
- **`steward-evm-account.ts` (EVM bridge)** uses `STEWARD_AGENT_TOKEN` (Bearer JWT) — this is the older bridge path for viem Account injection.

For full coverage, **set both** `STEWARD_API_KEY` and `STEWARD_AGENT_TOKEN` in cloud containers until the auth schemes are consolidated.

---

## EVM / BSC RPC

| Variable | Required | Description |
|---|---|---|
| `EVM_PRIVATE_KEY` | Optional | If set, the EVM plugin uses this private key directly (bypasses Steward). A dummy placeholder (`0x000...0001`) is injected automatically by `stewardEvmPreBoot()` when Steward is configured — do not set this manually in Steward-managed containers. |
| `NODEREAL_BSC_RPC_URL` | Optional | NodeReal BSC RPC endpoint. Needed for direct-signing EVM transactions if `ELIZAOS_CLOUD_API_KEY` is not set. |
| `QUICKNODE_BSC_RPC_URL` | Optional | QuickNode BSC RPC endpoint. Alternative to NodeReal. |
| `BSC_RPC_URL` | Optional | Generic BSC RPC URL fallback. |

> **Note:** `@stwd/eliza-plugin`'s `STEWARD_TRANSFER` action bypasses BSC RPC entirely — it delegates signing to the Steward API and does not need any of the RPC variables above.

---

## Minimal Required Set (Steward path)

For a cloud container using the recommended Steward transaction path (`@stwd/eliza-plugin`), the minimum required environment is:

```
MILADY_CLOUD_PROVISIONED=1
STEWARD_API_URL=https://steward.example.com
STEWARD_API_KEY=<service-api-key>
STEWARD_AGENT_TOKEN=<per-agent-bearer-jwt>
```

With `ELIZAOS_CLOUD_API_KEY` also set for cloud inference and BSC RPC proxy.

---

## How Auto-Enable Works

When `STEWARD_API_URL` is set, `packages/agent/src/config/plugin-auto-enable.ts` automatically adds `@stwd/eliza-plugin` to the plugin allow-list. This registers `StewardService` and the `STEWARD_TRANSFER` action with the ElizaOS runtime so chat-triggered transactions can reach the blockchain.

When `MILADY_CLOUD_PROVISIONED=1` and `STEWARD_AGENT_TOKEN` are both set, the EVM plugin (`@elizaos/plugin-evm`) is also auto-enabled and wallet address discovery runs at pre-boot via `stewardEvmPreBoot()`.

---

*Last updated: 2026-04-02 — see `docs/steward-execution-audit.md` for full architecture trace.*
