# SOW Completion Execution Plan (Alice) - 2026-02-21

## Scope
- Complete the remaining SOW work for Alice streaming and agent runtime readiness.
- Close capability gaps across truthy and falsy routes with production-realistic acceptance criteria.
- Enforce one deployment model across repos so implementation and release stay aligned.

## Deployment Source of Truth (Non-Negotiable)
- Runtime implementation branch: `milaidy/alice`.
- Deployment trigger branch: `555-bot/alice`.
- Rule: every deployable runtime change merged in `milaidy/alice` must be mirrored into `555-bot/alice` to trigger workflow/deploy.
- Rule: no release is considered complete until both are updated and mapped by commit hash.

## Current Baseline (as of 2026-02-21)
- Alice critical journey E2E expanded and passing in live environment with environment-aware degradations.
- Coverage includes: auth, economics, go-live, segments/explore fallback, ads lifecycle, sources/screen, guests, radio, PiP/split scene operations, chat flow, end-live, falsy guardrails.
- Known live gaps still to close for strict full-parity mode:
- marketplace endpoint availability parity.
- games endpoint availability parity.
- radio cold-start config behavior standardization.
- chat ingestion hard-failure behavior hardening.
- ad plan-limit semantics normalization (structured policy response instead of generic 500).

## Phase Plan

## Phase 1 - Contract Parity and Error Semantics
- Goal: normalize endpoint availability and failure shapes for all required streaming paths.
- Deliverables:
- Ensure required agent endpoints exist and are mounted in runtime: marketplace, games, radio, chat, ads, segments.
- Replace ambiguous 500 responses with typed policy/business errors.
- Add deterministic fallback behavior for unavailable integrations.
- Acceptance:
- API contract tests pass for each endpoint with stable status codes and error codes.
- No "Endpoint not found" for required routes in target environment.

## Phase 2 - Strict Capability Completion (No Degrade Mode)
- Goal: move from "degraded allowed" to strict pass for all core Alice requirements.
- Deliverables:
- Ads: create/trigger/metrics/schedule/dismiss reliably available for allowed plans.
- Screen composition: PiP and split-screen scene transitions validated with state verification.
- Economics: projected costs and projected earnings available from canonical APIs.
- Reactions/segments: autonomous + operator override behavior deterministic and observable.
- Guests, games, radio, chat: all flows available without 500-class operational failures.
- Acceptance:
- Strict E2E suite passes with no degraded annotations for production-expected features.

## Phase 3 - Plugin Hardening and Startup Defaults
- Goal: ensure plugin surfaces are installed, configured, and resilient at startup.
- Deliverables:
- Validate plugin install + runtime registration for Discord, Telegram, GitHub, stream, 555, sw4p, and custom ecosystem plugins.
- Validate required secrets are present and mapped to startup config.
- Add plugin health/self-check at boot with explicit fail-open/fail-closed policy per plugin class.
- Acceptance:
- Plugin readiness report generated at startup and exposed to ops.
- No missing-compiled-artifact startup failures for required plugins.

## Phase 4 - Observability, Recovery, and Go-Live Gates
- Goal: production confidence with traceable evidence and rollback readiness.
- Deliverables:
- Dashboard + alert coverage for core Alice streaming journeys and plugin lifecycle failures.
- Runbook for PVC-safe migrations and rollback preserving Alice memory/state.
- Release checklist with hard go/no-go gates.
- Acceptance:
- Go-live checklist complete with evidence links.
- Recovery drill executed and documented.

## Phase 5 - Release Choreography Enforcement
- Goal: prevent repo drift between implementation and deployment trigger.
- Deliverables:
- Commit mapping log: `milaidy/alice` commit -> `555-bot/alice` trigger commit.
- PR template section requiring cross-repo mapping before merge.
- CI check or scripted guard that fails release if mapping is missing.
- Acceptance:
- Every release has a recorded two-repo mapping entry.
- No production deploy without corresponding `milaidy/alice` source commit reference.

## Execution Board (Priority Order)
1. Normalize API contract/error semantics for required routes.
2. Remove degraded-path dependencies for core Alice live journey.
3. Complete plugin startup hardening and secret validation.
4. Add strict-mode E2E gate and make it release-blocking.
5. Enforce two-repo release choreography (`milaidy/alice` -> `555-bot/alice` trigger).

## Test Strategy (Completion Definition)
- Unit: validator, policy, and route error-shape tests.
- Integration: plugin registration, startup config, and route/controller integration.
- E2E:
- Truthy journey: auth -> go-live -> ads -> segment/reaction -> screen composition -> guests/games/radio/chat -> end-live.
- Falsy journey: invalid payloads, missing scopes, missing config, policy-denied paths.
- Gate:
- Required suites green before release trigger commit in `555-bot/alice`.

## Operator Notes
- Work execution happens in `milaidy/alice`.
- Deployment is triggered by commits in `555-bot/alice`.
- This split is intentional and must be preserved to avoid release confusion.
