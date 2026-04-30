# Memory Gate

The Memory Gate is a trust-based filter that evaluates all memory write operations before they reach the database. It implements a 3-tier routing system to protect agent memory from manipulation.

## Architecture

```
Incoming Memory Write
        │
        ▼
  ┌─────────────┐
  │ Trust Scorer │  ← Computes multi-dimensional trust score
  └──────┬──────┘
         │
         ▼
  ┌──────────────┐
  │  Memory Gate │  ← Routes based on trust thresholds
  └──────┬───────┘
         │
    ┌────┼────┐
    │    │    │
    ▼    ▼    ▼
  Allow  Q   Reject
         │
    Quarantine
    (time-limited)
```

## 3-Tier Routing

| Tier | Condition | Action |
|------|-----------|--------|
| **Allow** | `trust >= writeThreshold` (default: 0.7) | Memory written immediately |
| **Quarantine** | `quarantineThreshold <= trust < writeThreshold` | Buffered for manual review |
| **Reject** | `trust < quarantineThreshold` (default: 0.3) | Discarded with audit log |

## Quarantine Workflow

1. **Buffer**: Memories that fall in the quarantine zone are stored in an in-memory buffer
2. **Expiry**: Quarantined memories auto-expire after `quarantineReviewMs` (default: 1 hour)
3. **Review**: Operators can approve or reject quarantined memories via the API
4. **Capacity**: Buffer capped at `maxQuarantineSize` (default: 1000) — oldest entries evicted when full

### Reviewing Quarantined Memories

```typescript
const gate = service.getMemoryGate();

// List quarantined memories
const quarantined = await gate.getQuarantined();

// Approve — writes to database
await gate.reviewQuarantined(memoryId, "approve");

// Reject — discards permanently
await gate.reviewQuarantined(memoryId, "reject");
```

## Gate Decision Interface

```typescript
interface MemoryGateDecision {
  action: "allow" | "quarantine" | "reject";
  trustScore: TrustScore;
  reason: string;
  reviewAfterMs?: number;  // For quarantined memories
}
```

## Configuration

In `milaidy.json5`:

```json5
{
  "autonomy": {
    "enabled": true,
    "trust": {
      "writeThreshold": 0.7,        // Minimum trust for auto-allow
      "quarantineThreshold": 0.3,    // Below this → reject
      "llmAnalysis": false,          // Enable LLM content analysis
      "historyWindow": 100           // Messages for source reliability
    },
    "memoryGate": {
      "enabled": true,
      "quarantineReviewMs": 3600000, // 1 hour auto-expiry
      "maxQuarantineSize": 1000      // Max buffered memories
    }
  }
}
```

## Statistics

```typescript
const stats = gate.getStats();
// {
//   totalEvaluated: number,
//   allowed: number,
//   quarantined: number,
//   rejected: number,
//   currentQuarantineSize: number
// }
```

## Integration with Trust Scorer

The Memory Gate depends on the Trust Scorer for evaluating incoming content. The scorer provides a multi-dimensional trust assessment that the gate uses to make routing decisions. See [trust-scoring.md](./trust-scoring.md) for details on how trust scores are computed.
