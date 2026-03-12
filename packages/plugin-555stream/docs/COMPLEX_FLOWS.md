# 555 Stream — Complex Flows

This document covers the non-trivial operator flows that must work in public use.

## 1. Wallet auth with operator assistance

Use this flow when API-key auth is unavailable and the operator must help the agent authenticate.

1. `STREAM555_AUTH_WALLET_LOGIN`
2. if no runtime wallet exists and provisioning is allowed:
   - `STREAM555_AUTH_WALLET_PROVISION_LINKED`
3. re-run wallet login
4. verify auth with:
   - `STREAM555_AUTH_APIKEY_LIST` or `STREAM555_HEALTHCHECK`

Rules:
- prefer Solana
- fall back to Ethereum only when Solana is unavailable
- provisioning should be an explicit operator decision, not a silent background side effect

## 2. Channel setup for multi-cast

1. `STREAM555_PLATFORM_CONFIG` per channel
2. `STREAM555_PLATFORM_TOGGLE` to enable each channel
3. `STREAM555_STREAM_STATUS` to confirm readiness before go-live

Recommended order:
- Pump.fun
- Twitch
- Kick
- X
- YouTube
- Facebook
- Custom

## 3. App viewer go-live

Use when the source is an app/web surface rather than a direct capture/composition.

1. `STREAM555_APP_LIST`
2. `STREAM555_GO_LIVE_APP`
3. `STREAM555_STREAM_STATUS`

Do not use this path for gameplay smoke when the intended flow is arcade-driven Cloudflare gameplay.

## 4. Ad break lifecycle

1. `STREAM555_AD_LIST`
2. `STREAM555_AD_BREAK_TRIGGER`
3. optional `STREAM555_AD_BREAK_DISMISS`

Rules:
- respect platform/global cooldowns
- do not stack transitions on top of an active ad unless the operator explicitly wants that
- if the ad renderer is degraded, dismiss and restore stream baseline before retrying

## 5. Safe stop flow

1. call `STREAM555_STREAM_STOP`
2. receive pending approval
3. operator resolves approval
4. re-call `STREAM555_STREAM_STOP` with `_approvalId`
5. confirm with `STREAM555_STREAM_STATUS`

## 6. Guest + overlays live workflow

1. `STREAM555_GUEST_INVITE`
2. `STREAM555_LAYOUT_SET` or `STREAM555_SCENE_SET_ACTIVE`
3. `STREAM555_TEMPLATE_APPLY` or `STREAM555_GRAPHICS_CREATE`
4. `STREAM555_CHAT_START`

If removing a guest:
- `STREAM555_GUEST_REMOVE` is approval-bound in normal production usage

## 7. OpenClaw-assisted scene ops

For OpenClaw-driven content:
- start from a bound session
- use template and overlay suggestion actions first
- use direct graphics actions only when template flow is insufficient
- avoid heavy transition churn during ad windows

## 8. Recovery after auth drift

If long-lived live operations start returning `401`:
- verify API-key exchange is configured
- allow token refresh to occur
- re-run `STREAM555_STREAM_STATUS`
- only re-bootstrap session if refresh path did not restore readiness
