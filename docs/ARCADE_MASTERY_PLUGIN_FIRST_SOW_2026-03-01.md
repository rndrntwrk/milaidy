# 555 Arcade Mastery Program SOW (Milaidy Plugin-First)

Date: March 1, 2026  
Scope: `milaidy` strategy authority, learning loop, and plugin-first distribution.

## 1) Product Position

- Canonical install surface remains plugin-first:
  - `five55-games`
  - `stream555-*`
- Optional in-app `555 Arcade` shell is additive and must not replace plugin APIs.

## 2) Strategic Authority

Milaidy is authoritative for:

- launch policy selection,
- policy version routing,
- reflection and writeback decisions,
- control authority declaration (`milaidy`).

`555-bot` can assist with trigger/restart only when native autonomy is active.

## 3) Intelligence Components

Implemented in `src/plugins/five55-games/intelligence/`:

- `GamePolicyRegistry`: game-family mapping + defaults + bounds sanitation.
- `PolicyEngine`: launch profile resolution from learning profile.
- `OutcomeAnalyzer`: bounded correction proposals from episode outcomes.
- `EpisodeReflectionPipeline`: apply-if-needed logic with guarded writeback.
- `AutonomySupervisor`: orchestration entrypoint used by GO_LIVE_PLAY path.

## 4) Runtime Contract in GO_LIVE_PLAY

`FIVE55_GAMES_GO_LIVE_PLAY` now:

1. Ensures session bootstrap.
2. Ensures Cloudflare output provisioning.
3. Loads learning snapshot.
4. Applies reflection writeback when eligible.
5. Starts gameplay with policy metadata:
   - `controlAuthority`, `policyVersion`, `policySnapshot`, `policyFamily`.

## 5) Safety, Fairness, and Gating

- Observable-state-only assumptions for runtime decision inputs.
- Guardrailed policy deltas (bounded step sizes, bounded ranges).
- Alice-only fast path remains alias-gated.
- Non-Alice agents can still use baseline SDK path without privileged knobs.

## 6) Feature Flags

- `ALICE_INTELLIGENCE_ENABLED`
- `ALICE_LEARNING_WRITEBACK_ENABLED`

Recommended rollout:

1. Shadow mode (read + analyze only).
2. Alice canary writeback.
3. Alice production default.
4. Multi-agent baseline rollout after certification gates pass.

## 7) Open-Source Standardization

Required release artifacts per milestone:

- versioned API contract updates,
- migration notes,
- test evidence for policy and reflection behavior,
- security and fairness notes for observable-state boundary.

## 8) Production 555Drive Native-Control Addendum (August 21, 2026)

`FIVE55_GAMES_GO_LIVE_PLAY` has a separate fail-closed contract when `gameId` is
`555drive`; the local rehearsal action remains local-only.

- `FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED=true`, an explicit `sessionId`, an
  immutable `gameRunId`, agent mode, Alice room context, configured agent auth,
  and a credential-free remote HTTPS `STREAM555_BASE_URL` are required before
  production provisioning.
- The play request binds `runId`, `controlAuthority: "milaidy"`, and the exact
  racing-line policy snapshot. The returned session, game, run, and source must
  match the request, and the gameplay authority must report the same
  `fenced_agent_v1` binding both before and after control.
- The action does not return live success until the existing gameplay supervisor
  has observed the ordered accepted -> enqueued -> injected -> reflected receipt
  chain plus the matching authoritative native raw movement sample, persisted
  Alice reflection/mastery, persisted and broadcast the VRM reaction, and proved
  the terminal neutral release. Any missing proof fails the action.
- Concurrent requests for the same session/run/source share one in-flight
  control execution. Transport closure, stop, timeout, or another terminal error
  follows the supervisor's bounded neutral-release path; neutral-proof failure is
  never converted to success.
- The deployed Alice image must mount the approved digest-pinned gameplay SDK
  bundle and Arcade controller closure at the three
  `FIVE55_GAMES_LOCAL_SDK_ROOT`, `FIVE55_GAMES_LOCAL_SDK_ENTRY`, and
  `FIVE55_GAMES_LOCAL_ARCADE_ROOT` paths. These local files supply controller
  code only; success evidence still comes from the authenticated remote Stream
  gameplay authority and native renderer.

This contract qualifies the action wiring; it is not a substitute for the
controlled live canary and teardown evidence required for production promotion.
