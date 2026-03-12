---
name: "Stream Operator Skill"
description: "Run safe 3-step 555stream operations: authenticate, configure, and go live with recovery controls."
metadata:
  {
    "audience": ["operator", "agent"],
    "plugin": "@rndrntwrk/plugin-555stream",
    "surface": "public-preview",
  }
---

# Stream Operator Skill

Use this skill when an agent must operate `555 Stream` in production without drifting into host-specific assumptions.

## When to use

- authenticate or verify `555 Stream`
- bootstrap a stream session
- configure channels and go live
- operate ads, alerts, chat, guests, media, or studio state
- stop the stream safely with approvals

## Preconditions

- `@rndrntwrk/plugin-555stream` is installed and enabled
- the runtime exposes valid stream auth
- the operator wants canonical `STREAM555_*` actions, not legacy aliases
- ecosystem docs live at `https://docs.rndrntwrk.com/555stream`

## Primary workflow

### 1. Authenticate and bind
- Run `STREAM555_HEALTHCHECK`.
- Run `STREAM555_BOOTSTRAP_SESSION` (reuse a known `sessionId` when provided).
- Confirm the plugin is `loaded`, `authenticated`, and `ready`.

### 2. Configure channels and baseline studio state
- Configure outputs using `STREAM555_PLATFORM_CONFIG`.
- Enable outputs with `STREAM555_PLATFORM_TOGGLE`.
- Apply layout/scene defaults via `STREAM555_LAYOUT_SET` and/or `STREAM555_SCENE_SET_ACTIVE`.
- If app stream mode is needed, inspect `STREAM555_APP_LIST` first.

Example payloads:

```json
{"platform":"twitch","rtmpsUrl":"rtmps://ingest.global-contribute.live-video.net/app","streamKey":"live_xxx"}
```

```json
{"platform":"twitch","enabled":true}
```

### 3. Go live
- Use `STREAM555_STREAM_START` for camera/screen/composition inputs.
- Use `STREAM555_GO_LIVE_APP` for website-capture app viewers.
- Confirm `STREAM555_STREAM_STATUS` is active and includes expected output/session metadata.

Example payloads:

```json
{"input":{"type":"screen"}}
```

```json
{"appId":"hyperscape","mode":"spectator"}
```

### 4. Operate live
- Ads: `STREAM555_AD_LIST`, `STREAM555_AD_BREAK_TRIGGER`, `STREAM555_AD_BREAK_DISMISS`
- Alerts: `STREAM555_ALERT_CREATE`, `STREAM555_ALERT_CONTROL`
- Chat: `STREAM555_CHAT_START`, `STREAM555_CHAT_READ`, `STREAM555_CHAT_SEND`, `STREAM555_CHAT_STOP`
- Studio: scenes, graphics, sources, templates, overlays, media, guests, radio

### 5. Stop safely
- Run `STREAM555_STREAM_STOP`.
- If approval is required, resolve it and re-invoke with `_approvalId`.

Example approval re-entry:

```json
{"_approvalId":"approval_123"}
```

## Operator vs agent usage

- Operators should prefer explicit channel config, verification, and stop approvals.
- Agents should prefer idempotent reads first, then narrow mutating actions with explicit payloads.
- Neither should write secrets back unless the task explicitly asks for credential rotation.

## Safety Rules
- Require approvals for start/stop and ad-trigger operations in production.
- Never overwrite destination credentials unless explicitly instructed.
- Prefer idempotent operations (read status before mutate).
- On failure: capture error + upstream status + session ID before retrying.

## Recovery
- If stream start fails with output provisioning errors, run stop/start recovery path.
- If app viewer path fails, verify public URL reachability and app catalog metadata.
- If WebSocket state is stale, re-bootstrap session before issuing control actions.

## Escalation

- If auth returns HTML or login pages, treat it as host/web auth drift, not a stream API bug.
- If ads fail repeatedly, verify session-scoped ad inventory and cooldown before retrying.
- If status and real live state disagree, capture both and report an observability mismatch.
