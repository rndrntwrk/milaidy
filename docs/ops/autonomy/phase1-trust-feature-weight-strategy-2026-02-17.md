# Phase 1 Trust Feature Set and Weight Strategy (2026-02-17)

Checklist target: `P1-029`

## Canonical Feature Set

Source implementation:

- `src/autonomy/trust/scorer.ts`

Trust score dimensions:

1. `sourceReliability`
2. `contentConsistency`
3. `temporalCoherence`
4. `instructionAlignment`

## Weight Strategy

Current weighted composite:

- `sourceReliability`: `0.25`
- `contentConsistency`: `0.35`
- `temporalCoherence`: `0.15`
- `instructionAlignment`: `0.25`

Formula:

```text
trust = 0.25*sourceReliability
      + 0.35*contentConsistency
      + 0.15*temporalCoherence
      + 0.25*instructionAlignment
```

Rationale:

- Highest weight on `contentConsistency` to prioritize prompt-injection/manipulation detection.
- Balanced weighting between source reliability and instruction alignment to avoid over-trusting a historically good source when content conflicts with policy.
- Lower `temporalCoherence` weight to avoid over-penalizing bursty but legitimate interactions.

## Guardrails

- Source type is frozen at first-seen registration to prevent type escalation attacks.
- Bayesian history update (`alpha=2`, `beta=2`) limits overreaction to sparse feedback.
- Bounded scores (`0..1`) for each dimension and composite output.
- Unicode normalization/homoglyph stripping and zero-width character removal are applied for security pattern matching.
- Explicit injection/manipulation pattern sets gate content consistency.

## Validation Reference

Coverage tests:

- `src/autonomy/trust/scorer.test.ts`

Validation command:

```bash
./node_modules/.bin/vitest run src/autonomy/trust/scorer.test.ts
```
