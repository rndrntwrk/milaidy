# 555 Stream — Coverage and Gaps

Last reviewed: March 6, 2026.

## Publicly covered today

## Core operator path
- install and enable
- API-key or bearer auth
- session bootstrap
- channel configuration and enablement
- go-live via standard stream start
- go-live via app/website capture
- status checks
- approval-gated stop flow

## Studio controls
- scenes, layouts, state patch
- graphics create/update/toggle/delete
- templates and overlay suggestions
- alerts
- guests
- chat
- media upload/import/delete
- radio controls

## Monetization
- ad inventory read
- ad trigger
- ad dismiss
- ad scheduling

## Milaidy surface
- package-owned config schema
- package-owned UI schema
- canonical `555 Stream` naming
- installed/enabled/loaded/authenticated/ready lifecycle
- operator skill docs

## Known gaps or risks

## P0
- ad renderer/compositor parity still needs independent verification against human-facing studio behavior
- some older control-plane builds can under-report per-channel live status even when the session is live

## P1
- guest/PiP/public docs can be expanded further once the underlying studio contracts are finalized
- direct screenshots/gifs for public docs are not packaged yet

## P2
- legacy compatibility actions still increase cognitive load in the package surface, even though the public docs now isolate them

## Explicit non-goals for this package

- gameplay orchestration belongs in `@rndrntwrk/plugin-555arcade`
- deploy logic belongs outside this package
- human studio compositor design parity is upstream work, not a docs-only concern

## Publication read

This package is documentation-ready for public operator/developer onboarding.

Before broad publication, the remaining practical gates are:
- compositor/ad correctness sign-off
- final pass on live channel status accuracy
- release checklist completion
