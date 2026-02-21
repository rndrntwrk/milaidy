# Stream555 Readiness Implementation Checklist (2026-02-21)

## Scope
This checklist tracks production-readiness work for the stream/action expansion shipped in commit `15d5589`, grounded in current Alice runtime behavior.

## Status Legend
- `[ ]` not started
- `[-]` in progress
- `[x]` complete

## Strict Execution Order
1. P0 gates (`P0.1`-`P0.6`) - no release without all complete.
2. P1 hardening (`P1.1`-`P1.4`) - first patch release after P0.
3. P2 operations (`P2.1`-`P2.3`) - required for scale and incident response.

## Priority Order

### P0 - Must complete before next production release
- [x] P0.1 Route `go-live` to canonical `stream555-control` path first, with safe legacy fallback.
- [x] P0.2 Prevent false-positive UI success toasts by requiring action-level success envelopes.
- [x] P0.3 Add settings observability for `STREAM555_CONTROL_PLUGIN_ENABLED`.
- [x] P0.4 Add focused tests for chat quick-layer success/failure branching.
- [x] P0.5 Add focused tests for action envelope parsing edge cases (direct/fenced/malformed).
- [ ] P0.6 Validate end-to-end action sequence against live control-plane:
  `GO_LIVE -> SCREEN_SHARE -> AD_CREATE/TRIGGER -> SEGMENT_OVERRIDE -> EARNINGS -> END_LIVE`.

### P1 - High priority hardening
- [x] P1.1 Add explicit fallback-state notices when stream555 path fails and legacy fallback is used.
- [x] P1.2 Add metric counters for quick-layer dispatch/success/failure by action name.
- [x] P1.3 Add bounded retries/backoff policy for transient `429/5xx` action failures in UI flow.
- [-] P1.4 Add deployment-level rollback switch for `STREAM555_CONTROL_PLUGIN_ENABLED` without manifest edits.

### P2 - Operational excellence
- [ ] P2.1 Publish runbook for incident triage with exact log queries and expected envelopes.
- [ ] P2.2 Add synthetic canary that exercises one safe stream555 action per deploy.
- [ ] P2.3 Add dashboard panel for action timeline error rates and fallback frequency.

## Acceptance Gates
- [x] Gate A: No quick-layer emits success toast unless corresponding action envelope has `ok=true` (or deterministic success rule).
- [x] Gate B: `go-live` executes on stream555-control when available; fallback to legacy stream only when required.
- [x] Gate C: Settings page shows both `STREAM_PLUGIN_ENABLED` and `STREAM555_CONTROL_PLUGIN_ENABLED`.
- [ ] Gate D: Live sequence completes with no silent failure and with traceable envelopes in Actions timeline.
- [x] Gate E: Quick-layer telemetry emits `dispatch/success/failure` counters tagged by action name for Prometheus export.
- [x] Gate F: Legacy go-live fallback notice explicitly includes whether stream555 primary failed and why.
- [x] Gate G: Quick-layer action dispatch retries bounded with backoff+jitter for transient `429/5xx` errors.

## Verification Log
- [x] Verified targeted unit tests for `src/plugins/stream555-control/index.test.ts` pass.
- [x] Verified UI quick-layer tests pass.
- [x] Verified retry helper tests in `apps/app/test/components/quick-layer-retry.test.ts` pass.
- [x] Verified `/api/agent/autonomy/execute-plan` test coverage for quick-layer metrics counters (dispatch/success/failure).
- [x] Verified `ChatView` quick-layer paths route through retry wrapper for transient `429/5xx` errors.
- [x] Captured prior live smoke failure mode (`503 {"error":"Autonomy execution pipeline not available"}`) and reproduced baseline before fallback patch.
- [x] Added server-side direct-runtime fallback for `/api/agent/autonomy/execute-plan` when autonomy pipeline is unavailable, with test coverage.
- [x] Added regression coverage so direct-runtime steps now return `success=false` when action handlers return `{ success: false }`, including propagated error text.
- [ ] Post-deploy live smoke against canonical `STREAM555_*` actions still fails at envelope layer with upstream `401 Invalid agent token` (`STREAM555_AGENT_TOKEN` path), despite runtime step execution succeeding.
- [ ] Verified live environment smoke pass.
- [ ] Verified rollback path documented and tested end-to-end in runbook.

## Immediate Next Actions
- [-] Execute live smoke path for `P0.6` in staging/prod-like env and capture envelope evidence.
- [ ] Rotate/fix `STREAM555_AGENT_TOKEN` (secret `production/alice-secrets`) and re-run canonical sequence: `STREAM555_GO_LIVE -> STREAM555_SCREEN_SHARE -> STREAM555_AD_CREATE/TRIGGER -> STREAM555_SEGMENT_OVERRIDE -> STREAM555_EARNINGS_ESTIMATE -> STREAM555_END_LIVE`.
- [ ] Add deploy-time rollback toggle procedure for `STREAM555_CONTROL_PLUGIN_ENABLED` (`P1.4`) and capture proof run.
