---
name: "OpenClaw Stream Skill"
description: "Operate 555stream scenes, overlays, and ad-safe transitions with OpenClaw content workflows."
metadata:
  {
    "audience": ["agent"],
    "plugin": "@rndrntwrk/plugin-555stream",
    "integration": "openclaw",
  }
---

# OpenClaw Stream Skill

Use this skill when OpenClaw-driven agents need to integrate with 555stream overlays and live control.

## Scope
- stream session lifecycle integration
- overlay/template operations
- ad-aware transitions
- safety-first control constraints

## Integration Sequence
1. Run the stream operator baseline: `STREAM555_HEALTHCHECK`, `STREAM555_BOOTSTRAP_SESSION`, then `STREAM555_STREAM_START` or `STREAM555_GO_LIVE_APP`.
2. Establish a stable scene/layout baseline.
3. Use templates and overlay suggestions first:
   - `STREAM555_TEMPLATE_LIST`
   - `STREAM555_TEMPLATE_APPLY`
   - `STREAM555_OVERLAY_SUGGEST`
4. Fall back to direct graphics actions only when template flow is insufficient.

Example overlay payload:

```json
{"templateId":"lbar-default","variables":{"headline":"Now playing","subhead":"OpenClaw assisted stream"}}
```

## Operational Rules
- Treat OpenClaw suggestions as advisory unless operator has enabled auto-apply.
- Always verify active scene before applying transitions or overlays.
- Keep ad breaks isolated: pause transition-heavy actions while an ad break is active.
- Preserve viewer readability: avoid stacking multiple high-contrast overlays.

## Recommended Action Set
- Scene changes: `STREAM555_SCENE_TRANSITION`, `STREAM555_SCENE_SET_ACTIVE`
- Overlay controls: `STREAM555_GRAPHICS_CREATE`, `STREAM555_GRAPHICS_UPDATE`, `STREAM555_GRAPHICS_TOGGLE`
- Monetization slots: `STREAM555_AD_LIST`, `STREAM555_AD_BREAK_TRIGGER`, `STREAM555_AD_BREAK_DISMISS`
- Live feedback: `STREAM555_CHAT_READ`, `STREAM555_CHAT_SEND`

## Failure Handling
- If overlay/template apply fails, fall back to direct graphics actions.
- If scene transition fails, issue `STREAM555_SCENE_SET_ACTIVE` as deterministic fallback.
- If ad render check fails, dismiss ad break and restore baseline scene before retry.

## Do not do

- Do not treat OpenClaw suggestions as authority over stream auth or channel routing.
- Do not start/stop the stream repeatedly to compensate for template/overlay failures.
