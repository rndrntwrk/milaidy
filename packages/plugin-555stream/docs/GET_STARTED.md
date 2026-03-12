# 555 Stream — Get Started

This is the shortest correct path to a working public stream operator setup.

## Goal

Get an agent from:
- plugin installed
- authenticated
- session bound
- channels configured
- live

without touching shell-only internals.

## Prerequisites

- Milaidy or elizaOS host with `@rndrntwrk/plugin-555stream` installed
- one of:
  - `STREAM555_AGENT_API_KEY` preferred
  - `STREAM555_AGENT_TOKEN` fallback
- one or more channel outputs you actually intend to publish to

## Step 1 — Install and enable

Add the plugin to the character/runtime:

```json
{
  "plugins": [
    "@elizaos/plugin-bootstrap",
    "@rndrntwrk/plugin-555stream"
  ]
}
```

Then enable it in the host.

Expected result:
- plugin card shows `Installed`
- plugin card shows `Enabled`

## Step 2 — Authenticate and bind a session

Run these actions in order:

1. `STREAM555_HEALTHCHECK`
2. `STREAM555_BOOTSTRAP_SESSION`
3. `STREAM555_STREAM_STATUS`

Expected result:
- auth succeeds
- a session is created or resumed
- stream status returns a concrete session ID

If `BOOTSTRAP_SESSION` is given a `sessionId`, it should reuse that session. Otherwise it binds a default or creates/resumes one.

## Step 3 — Configure channels

For each channel you want to use:

1. save RTMP URL + stream key with `STREAM555_PLATFORM_CONFIG`
2. enable the channel with `STREAM555_PLATFORM_TOGGLE`

Recommended first channels:
- Pump.fun
- Twitch
- Kick
- X
- Custom

Expected result:
- credentials persist
- enabled channels report ready for sync/go-live

## Step 4 — Choose a go-live path

### Standard studio path
Use:
- `STREAM555_STREAM_START`

Typical inputs:
- screen
- camera
- composition
- radio
- RTMP ingress

### App/website path
Use:
- `STREAM555_APP_LIST`
- `STREAM555_GO_LIVE_APP`

Use this when the live source is an app viewer or website capture surface.

## Step 5 — Verify live state

Run:
- `STREAM555_STREAM_STATUS`

Confirm:
- stream is active
- session is still bound
- expected channels are present

## Step 6 — Monetize or operate live

Typical live actions:
- `STREAM555_AD_LIST`
- `STREAM555_AD_BREAK_TRIGGER`
- `STREAM555_ALERT_CREATE`
- `STREAM555_CHAT_START`
- `STREAM555_CHAT_READ`
- `STREAM555_CHAT_SEND`
- `STREAM555_SCENE_TRANSITION`

## Step 7 — Stop safely

Run:
- `STREAM555_STREAM_STOP`

If approvals are enabled:
- resolve the approval
- re-invoke the action with `_approvalId`

## Good defaults

- keep `STREAM555_REQUIRE_APPROVALS=true`
- prefer API key exchange over static bearer
- configure channels once, then reuse them
- always read status before and after a mutating action

## Next docs

- `INSTALL_AND_AUTH.md`
- `ACTIONS_REFERENCE.md`
- `EDGE_CASES_AND_RECOVERY.md`
