# Dataset Policy for Alice Fine-Tuning

## Purpose

Define strict, reproducible rules for building supervised and preference datasets used to improve Alice.

## Scope

This policy applies to:

- knowledge-derived supervised datasets (SFT),
- trajectory-derived behavior datasets,
- all training artifacts used for model promotion.

## Canonical Data Sources

1. `knowledge/` inside `milaidy` for runtime-native corpus development.
2. `alice_knowledge/` in `555-bot` for production corpus deployment.
3. runtime trajectories collected by `@elizaos/plugin-trajectory-logger`.

## Data Classes

1. `knowledge_sft`
- generated from canonical markdown docs.
- must include source attribution in each assistant output.

2. `trajectory_sft`
- generated from validated tool-use trajectories.
- must include success/failure labels and safety metadata.

3. `trajectory_preference`
- pairwise or scored examples for response/tool ranking.
- must include reward rationale and verification outcome.

## Required Record Fields

Each dataset example must include:

- `id`
- `messages` (system, user, assistant)
- `metadata.sourcePath`
- `metadata.docId` (or trajectory id)
- `metadata.domain`
- `metadata.kind`
- `metadata.generatedAt`

## Hard Constraints

1. No secrets or credentials in training data.
2. No private user data unless explicitly approved and de-identified.
3. No unlabeled synthetic output without source attribution.
4. No train/validation/test leakage by exact prompt match.
5. Deterministic split assignment by stable hash + seed.

## Quality Gates

A dataset is rejected if any condition fails:

1. split files cannot be parsed line-by-line as JSON.
2. manifest hash/count does not match split files.
3. duplicate user prompts across splits exceed threshold.
4. missing source attribution for knowledge-derived examples.
5. required metadata fields missing.

## Versioning

Every dataset build must produce:

1. dataset manifest with hash, counts, split metadata.
2. immutable build id with timestamp + seed.
3. markdown report summarizing quality checks.

## Ownership

- primary owner: agent platform engineering
- policy approver: product/security lead

