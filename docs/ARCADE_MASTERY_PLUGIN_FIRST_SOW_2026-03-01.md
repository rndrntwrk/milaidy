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
