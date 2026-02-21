---
doc_id: ecosystem-canonical-v1
title: Rndrntwrk Ecosystem Canonical
domain: ecosystem
source_repo: rndrntwrk/555
source_paths:
  - /Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/founder-video-script.md
owner: enoomian
status: draft
updated_at: 2026-02-20T00:00:00Z
freshness_sla_days: 7
audience: executive
confidentiality: internal
---

# Rndrntwrk Ecosystem Canonical

## Introduction (Founder Baseline)

Rndrntwrk is not positioned as a single app. It is an attention-economy protocol with a live production surface today and an expanding autonomous agent and economic infrastructure beneath it.

The founder baseline, as stated in `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/founder-video-script.md`, is:

1. Attention is a scarce economic resource.
2. Creators and audiences should both participate in value capture.
3. Distribution and monetization should be protocol-designed, not platform-extracted.

This document is the canonical top-layer context for Alice CEO reasoning. It establishes the system worldview and the ground-truth boundaries that downstream domain docs (555, stream, sw4p, product/publication) must follow.

## Problem Statement

The ecosystem exists to solve the creator attention extraction loop:

1. Centralized platforms monetize audience attention while creators and audiences have limited ownership.
2. Audience value is fragmented across silos and not natively portable.
3. Monetization primitives often degrade content quality (interruptive ad formats, opaque rev-share, policy volatility).

## System Definition

Rndrntwrk is a layered system:

1. `555stream`: browser-native live production and distribution control plane.
2. `555 protocol`: policy and economic rails around monetization and reward allocation.
3. `x402 / AGG / Hyperlink`: payment and settlement primitives across chains.
4. `sw4p`: bridge and liquidity path between USDC and `$555`.
5. `555 arcade + leaderboard + rewards`: interactive engagement and score-backed progression surfaces.
6. `Alice (Milaidy-based agent runtime)`: autonomous operator layer for stream, game, and ecosystem actions.

## Core Thesis and Non-Negotiables

1. Non-interruptive monetization is a design requirement.
2. Audience reward participation is policy-enforced and auditable.
3. Agent operations must be trust-gated and attributable.
4. Revenue and payout behavior must be explicit, reviewable, and testable.
5. Founder claims must remain aligned to verifiable code and deployment state.

## Economic Baseline (Current Canonical Framing)

1. Audience Reward Pool (ARP): 10% allocation policy is treated as enforced policy configuration, not hardcoded immutability.
2. Remaining revenue allocation is policy-driven and environment-sensitive; no static claim should be made without current config confirmation.
3. Points, credits, and USDC payout systems are part of one economic pipeline and must be modeled with projection and settlement separation.

## Current Surface Snapshot (from founder script context)

1. `555stream` live browser studio and multi-destination distribution.
2. Ad marketplace and event/audit trail driven monetization controls.
3. `sw4p` mainnet presence with multi-chain posture.
4. Arcade surface with 18 browser games and shared leaderboard model.
5. Alice as an autonomous stream/game operator transitioning into Milaidy-local-first architecture.

## Strategic Direction

1. Move from tool-centric products to protocol-backed ecosystem behavior.
2. Shift Alice from crude operator behavior to trusted, policy-aware executive agent behavior.
3. Expand audience ownership and contribution proofs as first-class system objects.
4. Tighten publication and investor/community messaging to match implementation truth.

## Source-of-Truth Rules for This Canonical

1. Founder narrative informs direction, not unchecked implementation claims.
2. Deployment/runtime state overrides stale documentation claims.
3. Domain docs must link back to this canonical and declare deviations explicitly.

## Required Follow-On Canonical Docs

1. `knowledge/10_555/ARCHITECTURE.md`
2. `knowledge/20_stream/ARCHITECTURE.md`
3. `knowledge/30_sw4p/ARCHITECTURE.md`
4. `knowledge/40_product_publication/ROADMAP.md`

## Open Items for v1.0 Upgrade

1. Add explicit repo-by-repo service topology map.
2. Add authoritative revenue policy matrix by environment.
3. Add formal trust/authorization model for all privileged Alice actions.
4. Add payout timeline model (launch +30 days rules, weekly settlement rules, projection windows).

