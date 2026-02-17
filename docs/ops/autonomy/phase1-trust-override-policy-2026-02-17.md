# Phase 1 Trust Override Policy with Auditing (2026-02-17)

Checklist target: `P1-035`

## Implementation

Implemented governed trust-override controls in trust-aware retrieval with audit emission:

- `src/autonomy/memory/retriever.ts`
  - adds `trustOverridePolicy` context (`actor`, `source`, `approvedBy`, `reason`, `requestId`)
  - enforces fail-closed override policy:
    - non-system overrides require named actor attribution
    - overrides `>= 0.90` require independent approval + reason
  - emits `autonomy:retrieval:trust-override` audit record for every override attempt
    (`applied` / `clamped` / `rejected`, requested vs applied value, violations)
- `src/events/event-bus.ts`
  - adds typed event payload for `autonomy:retrieval:trust-override`
- `src/autonomy/service.ts`
  - wires retriever with autonomy event bus so override audit events are emitted at runtime
- `src/autonomy/memory/retriever.test.ts`
  - validates applied override with policy context
  - validates rejection on missing actor attribution
  - validates rejection of high-risk override without independent approval

## Validation

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/memory/retriever.test.ts src/autonomy/service.test.ts
```

Result:

- `2` test files passed
- `77` tests passed
