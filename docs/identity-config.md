# Identity Configuration

The Autonomy Kernel extends ElizaOS's minimal `IdentityConfig` with core values, communication style, behavioral boundaries, and integrity verification.

## Schema Reference

### `AutonomyIdentityConfig`

| Field | Type | Description |
|-------|------|-------------|
| `coreValues` | `string[]` | Core values governing agent behavior (at least one required) |
| `communicationStyle` | `CommunicationStyle` | Tone, verbosity, persona voice |
| `hardBoundaries` | `string[]` | Behavioral limits the agent must never cross |
| `softPreferences` | `Record<string, unknown>` | Adjustable preferences for high-trust user requests |
| `identityHash` | `string?` | SHA-256 hash for tamper detection |
| `identityVersion` | `number` | Version counter, incremented on every sanctioned change |

### `CommunicationStyle`

| Field | Type | Options |
|-------|------|---------|
| `tone` | `string` | `"formal"`, `"casual"`, `"technical"`, `"empathetic"` |
| `verbosity` | `string` | `"concise"`, `"balanced"`, `"detailed"` |
| `personaVoice` | `string` | Free-text persona voice description |

## API Reference

### `GET /api/agent/identity`

Returns the current identity configuration.

**Response:**
```json
{
  "identity": {
    "coreValues": ["helpfulness", "honesty", "safety"],
    "communicationStyle": {
      "tone": "casual",
      "verbosity": "balanced",
      "personaVoice": ""
    },
    "hardBoundaries": [],
    "softPreferences": {},
    "identityHash": "a1b2c3...",
    "identityVersion": 1
  }
}
```

### `PUT /api/agent/identity`

Updates the identity configuration. Accepts a partial update — unspecified fields retain their current values.

**Request body:**
```json
{
  "coreValues": ["helpfulness", "honesty", "safety", "transparency"],
  "communicationStyle": { "tone": "formal" }
}
```

### Identity Update Governance

Sanctioned update policy enforces actor attribution and approval rules:

- Actor attribution:
  - API updates must provide a named actor via `x-autonomy-actor` (or authenticated identity mapping).
- High-risk fields requiring independent approval + reason:
  - `name`
  - `coreValues`
  - `hardBoundaries`
- High-risk approval headers:
  - `x-autonomy-approved-by`: independent reviewer (must differ from actor)
  - `x-autonomy-change-reason`: change-control justification
- Kernel-managed fields rejected if supplied directly:
  - `identityVersion`
  - `identityHash`

**Response:**
```json
{
  "identity": {
    "coreValues": ["helpfulness", "honesty", "safety", "transparency"],
    "communicationStyle": { "tone": "formal", "verbosity": "balanced", "personaVoice": "" },
    "hardBoundaries": [],
    "softPreferences": {},
    "identityHash": "d4e5f6...",
    "identityVersion": 2
  }
}
```

### `GET /api/agent/identity/history`

Returns version trail information. Currently returns only the latest version snapshot (single entry). Full audit trail with persisted history is planned for Phase 2.

**Response:**
```json
{
  "version": 2,
  "hash": "d4e5f6...",
  "history": [
    { "version": 2, "hash": "d4e5f6...", "timestamp": 1700000000000 }
  ]
}
```

## Config File Example

In `milaidy.json5`:

```json5
{
  "autonomy": {
    "enabled": true,
    "identity": {
      "coreValues": ["helpfulness", "honesty", "safety"],
      "communicationStyle": {
        "tone": "casual",
        "verbosity": "balanced",
        "personaVoice": "Friendly and approachable assistant"
      },
      "hardBoundaries": ["never share user secrets", "never impersonate real people"],
      "softPreferences": {},
      "identityVersion": 1
    }
  }
}
```

## Integrity Verification

The identity hash is computed over protected fields (name, coreValues, hardBoundaries, communicationStyle, softPreferences) using SHA-256. This enables tamper detection:

```typescript
import { computeIdentityHash, verifyIdentityIntegrity } from "milaidy/autonomy";

// Verify integrity
const isValid = verifyIdentityIntegrity(identity);

// Recompute hash after sanctioned change
identity.identityHash = computeIdentityHash(identity);
```

**Security:** A missing hash is treated as a failure (fail-closed). Uninitialized identities must be explicitly initialized with `computeIdentityHash()`.

## Programmatic Usage

```typescript
import {
  createDefaultAutonomyIdentity,
  validateAutonomyIdentity,
} from "milaidy/autonomy";

// Create with defaults
const identity = createDefaultAutonomyIdentity();
// => { coreValues: ["helpfulness", "honesty", "safety"], ... }

// Validate
const issues = validateAutonomyIdentity(identity);
// => [] (empty = valid)
```
