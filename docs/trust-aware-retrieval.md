# Trust-Aware Retrieval

The trust-aware retrieval system ranks memories by multiple dimensions to produce contextually relevant, trustworthy results for the agent's context window.

## Ranking Algorithm

Each candidate memory receives a composite rank score:

```
rankScore = w_trust    × trustScore
          + w_recency  × recencyScore
          + w_relevance × relevanceScore
          + w_type     × typeBoost
```

### Default Weights

| Dimension | Weight | Source |
|-----------|--------|--------|
| Trust | 0.30 | Memory metadata `trustScore`, or scorer, or 0.5 default |
| Recency | 0.25 | Exponential decay with 24h half-life |
| Relevance | 0.30 | Semantic similarity from `searchMemories`, or 0.5 default |
| Type | 0.15 | Per-type boost multiplier |

### Type Boosts

| Memory Type | Default Boost | Rationale |
|-------------|---------------|-----------|
| `instruction` | 1.0 | Core behavioral directives |
| `system` | 1.0 | System-level configuration |
| `fact` | 0.9 | Verified knowledge |
| `goal` | 0.85 | Active objectives |
| `preference` | 0.8 | User preferences |
| `observation` | 0.6 | General observations |
| _(unknown)_ | 0.5 | Fallback for unrecognized types |

### Recency Scoring

Uses exponential decay with a 24-hour half-life:

```
recencyScore = 0.5 ^ (ageMs / 86400000)
```

- 1 second ago: ~1.0
- 24 hours ago: ~0.5
- 48 hours ago: ~0.25
- 1 week ago: ~0.008

## Retrieval Pipeline

1. **Fetch candidates**: Union of time-ordered (`getMemories`) and semantic (`searchMemories`) results, deduplicated by memory ID
2. **Score**: Compute trust, recency, relevance, and type scores for each candidate
3. **Filter**: Remove memories below `minTrustThreshold` (default: 0.1)
4. **Sort**: Descending by composite rank score
5. **Trim**: Limit to `maxResults` (default: 20)

## Configuration

```json5
{
  "autonomy": {
    "retrieval": {
      "trustWeight": 0.3,
      "recencyWeight": 0.25,
      "relevanceWeight": 0.3,
      "typeWeight": 0.15,
      "maxResults": 20,
      "minTrustThreshold": 0.1,
      "typeBoosts": {
        "instruction": 1.0,
        "observation": 0.7  // Override default
      }
    }
  }
}
```

**Validation**: Weights must each be between 0 and 1, and should sum to approximately 1.0 (tolerance: 0.05).

## User Overrides

### Trust Override

Force a specific trust score for all memories in a retrieval:

```typescript
const results = await retriever.retrieve(runtime, {
  roomId,
  trustOverride: 0.9,  // All memories treated as high-trust
  trustOverridePolicy: {
    source: "api",
    actor: "ops-user",
    approvedBy: "security-reviewer",
    reason: "incident-response retrieval runbook",
    requestId: "retrieval-override-001",
  },
});
```

Trust override policy:

- non-system overrides require a named actor
- overrides `>= 0.90` require independent approval (`approvedBy`) and `reason`
- missing policy requirements fail closed (override rejected; baseline trust scoring is used)

### Memory Type Filter

Restrict results to specific memory types:

```typescript
const results = await retriever.retrieve(runtime, {
  roomId,
  memoryTypes: ["instruction", "fact"],
});
```

## Provider Integration

The `milaidyTrustRetrieval` provider (position: 15) automatically injects ranked memories into the agent's context:

```
## Trusted Memory Context
- [instruction|trust:90%] Always respond in English
- [fact|trust:85%] User's timezone is EST
- [preference|trust:75%] User prefers concise responses
```

The provider is registered in the Milaidy plugin and resolves the retriever from the DI container.

## Override Auditing

Every trust override attempt emits an audit event:

- event: `autonomy:retrieval:trust-override`
- payload includes:
  - actor/source attribution
  - requested vs applied override
  - decision (`applied`, `clamped`, `rejected`)
  - violation reasons when rejected

## Programmatic Usage

```typescript
import { TrustAwareRetrieverImpl, DEFAULT_RETRIEVAL_CONFIG } from "milaidy/autonomy";

const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG, scorer);

const ranked = await retriever.retrieve(runtime, {
  roomId: "room-uuid",
  embedding: messageEmbedding,
  maxResults: 10,
  memoryTypes: ["instruction", "fact"],
});

for (const r of ranked) {
  console.log(`${r.memoryType} (trust: ${r.trustScore}, rank: ${r.rankScore})`);
  console.log(r.memory.content.text);
}
```

## RankedMemory Interface

```typescript
interface RankedMemory {
  memory: Memory;         // Original ElizaOS memory
  rankScore: number;      // Composite ranking score
  trustScore: number;     // Trust dimension
  recencyScore: number;   // Recency dimension
  relevanceScore: number; // Relevance dimension
  typeBoost: number;      // Type boost multiplier
  memoryType: MemoryType; // Inferred or explicit type
}
```
