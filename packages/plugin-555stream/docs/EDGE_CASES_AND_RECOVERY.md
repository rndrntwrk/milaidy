# 555 Stream — Edge Cases and Recovery

## Auth returns HTML instead of JSON

Symptom:
- client receives `<!DOCTYPE ...>` or an auth page instead of JSON

Meaning:
- host/web auth context is wrong
- request hit a login/access layer, not the API contract

Recovery:
- re-authenticate the operator in Milaidy
- confirm API requests carry the expected cookies or bearer
- retry healthcheck before any mutating action

## API key works at first, then long live operations fail

Symptom:
- later actions fail after an earlier successful bootstrap

Meaning:
- exchanged token expired and refresh did not occur or failed

Recovery:
- prefer `STREAM555_AGENT_API_KEY` over static bearer
- confirm token exchange endpoint is configured
- re-run `STREAM555_STREAM_STATUS`
- re-bootstrap only if the plugin does not recover after refresh

## Service is installed and enabled but not loaded

Symptom:
- UI shows package present, but test/action calls fail

Meaning:
- runtime service start failed

Recovery:
- inspect host logs for service initialization error
- verify package build/dist exists
- confirm host can resolve the canonical plugin package

## Channel saved but not live

Symptom:
- credentials appear persisted, but the channel does not publish

Meaning:
- channel is saved but not enabled, or enabled but incomplete

Recovery:
- check `STREAM555_PLATFORM_TOGGLE`
- confirm RTMP URL and stream key both exist
- verify stream status after go-live

## Ad trigger fails

Symptom:
- ad action returns cooldown or render failure

Meaning:
- ad window is not eligible yet, or ad/compositor state is degraded

Recovery:
- respect the cooldown
- verify session still has ad inventory
- dismiss stale ad state if needed
- restore baseline scene before retry

## Stop action never completes

Symptom:
- stop keeps returning pending or appears stuck

Meaning:
- approval was not resolved, or the re-invocation omitted `_approvalId`

Recovery:
- resolve the pending approval
- re-run `STREAM555_STREAM_STOP` with `_approvalId`
- verify with `STREAM555_STREAM_STATUS`

## WebSocket state is stale

Symptom:
- read actions return stale or incomplete runtime state

Meaning:
- realtime bind dropped or cache is stale

Recovery:
- re-run `STREAM555_BOOTSTRAP_SESSION`
- then re-run `STREAM555_STREAM_STATUS`

## Public vs internal URL confusion

Symptom:
- one agent works, another cannot reach the control plane

Meaning:
- wrong base URL path for that agent class

Recovery:
- public agents should use `STREAM555_PUBLIC_BASE_URL`
- only allow-listed internal agents should use `STREAM555_INTERNAL_BASE_URL`
- do not expose internal URLs in public operator setup
