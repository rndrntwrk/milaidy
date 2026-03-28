# 555 Stream — 3-Step Quickstart

Use this when you need the shortest possible operator runbook.

## Step 1 — Authenticate and bind

Run:
- `STREAM555_HEALTHCHECK`
- `STREAM555_BOOTSTRAP_SESSION`

Expected:
- auth is valid
- a session is bound

## Step 2 — Configure channels

Run:
- `STREAM555_PLATFORM_CONFIG`
- `STREAM555_PLATFORM_TOGGLE`

Optional:
- `STREAM555_LAYOUT_SET`
- `STREAM555_SCENE_SET_ACTIVE`

Expected:
- at least one enabled channel is fully configured

## Step 3 — Go live

Choose one:
- `STREAM555_STREAM_START`
- `STREAM555_GO_LIVE_APP`

Verify with:
- `STREAM555_STREAM_STATUS`

## Then operate

- Ads: `STREAM555_AD_LIST`, `STREAM555_AD_BREAK_TRIGGER`
- Alerts: `STREAM555_ALERT_CREATE`, `STREAM555_ALERT_CONTROL`
- Chat: `STREAM555_CHAT_START`, `STREAM555_CHAT_READ`, `STREAM555_CHAT_SEND`
- Stop: `STREAM555_STREAM_STOP`

## Full docs

- `GET_STARTED.md`
- `INSTALL_AND_AUTH.md`
