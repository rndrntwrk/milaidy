# Roles & Rolodex Architecture

## Overview

Two plugins handle identity and trust:

- **plugin-roles** (`packages/plugin-roles/`) — Coarse-grained access control. Who can do what.
- **relationships** (`eliza/packages/typescript/src/advanced-capabilities/` and `eliza/packages/typescript/src/services/`) — Fine-grained identity linking, relationship tracking, and information claims.

The agent runtime (`packages/agent/src/`) adds an escalation system on top of both.

---

## 1. Role Hierarchy

```
OWNER (rank 3)  — full control, ground-truth claims
  ↓
ADMIN (rank 2)  — can verify others, auto-accepted claims
  ↓
USER  (rank 1)  — self-service, claims need verification
  ↓
GUEST (rank 0)  — minimal trust, room-scoped claims
```

Roles live in world metadata: `world.metadata.roles[entityId] = "OWNER"`.

### How Roles Get Assigned

1. **Canonical owner** — configured via `milady.json` or `world.metadata.ownership.ownerId`
2. **Connector admin whitelist** — per-connector IDs in config auto-promote to ADMIN on first interaction
3. **Manual assignment** — `UPDATE_ROLE` action (only higher-rank users can promote)
4. **Owner auto-recognition** — if an entity's connector metadata matches an OWNER's declared platform identities, the OWNER role propagates across platforms automatically

### Key API

```typescript
// packages/plugin-roles/src/utils.ts
checkSenderRole(runtime, message) → { entityId, role, isOwner, isAdmin, canManageRoles }
resolveEntityRole(runtime, entity, worldId) → RoleName
canModifyRole(assignerRole, currentRole, targetRole) → boolean
```

---

## 2. Identity Claims

When someone says "my twitter is @alice_codes", a claim is created.

### Claim Structure

```
InformationClaim {
  field:      "twitter_handle"
  value:      "alice_codes"
  tier:       ground_truth | self_reported | hearsay | inferred
  confidence: 0.0–1.0 (decays over time)
  scope:      global | platform | room
  status:     accepted | pending | challenged | rejected
}
```

### What Role Determines

| Role  | Auto-Accept | Tier            | Scope    | Status   |
|-------|-------------|-----------------|----------|----------|
| OWNER | yes         | ground_truth    | global   | accepted |
| ADMIN | yes         | self_reported   | global   | accepted |
| USER  | no          | self_reported   | platform | pending  |
| GUEST | no          | hearsay         | room     | pending  |

Sensitive categories (wallets, phone/email) override ADMIN to require confirmation.

### Confidence Decay

Each tier has a half-life:
- **ground_truth**: never decays
- **self_reported**: 90 days
- **hearsay**: 30 days
- **inferred**: 14 days

Corroborations (others confirming) double the half-life. Disputes lower confidence.

---

## 3. Identity Extraction (Evaluator)

The `relationshipExtractionEvaluator` runs on every message:

1. Fetches last 15 messages from the room for conversation context
2. Sends conversation to LLM with a structured extraction prompt
3. LLM returns platform identities, relationships, disputes, privacy boundaries, trust signals
4. Code validates each extraction:
   - Normalizes platform names (`"x"` → `"twitter"`, `"gh"` → `"github"`)
   - Resolves `belongsTo` name to actual entity in the room
   - Looks up speaker's role and applies trust policy
   - **Overwrites LLM confidence** with role-based values (the LLM's confidence number is not used downstream)
5. Stores claims and triggers entity resolution

### The Prompt

The extraction prompt is intentionally minimal. It gives the LLM the conversation and a JSON schema. No confidence calibration instructions (since code overrides it). No defensive rules about "sure" or "yes" (the LLM reads the conversation and figures it out).

Legitimate guardrails that stay: no sarcastic/hypothetical/deleted/former identities.

### Supported Platforms (16)

**Social**: twitter, discord, telegram, github, youtube, instagram, linkedin, reddit, farcaster, lens, bluesky, nostr, warpcast

**Contact**: email, phone, website

Aliases handled by `normalizePlatform()`: x→twitter, bsky→bluesky, gh→github, tg→telegram, ig→instagram, li→linkedin.

---

## 4. Entity Resolution

Small-world graph approach. When a new identity is stored, the system looks for cross-platform matches.

### Signal Types & Weights

| Signal | Weight | What It Means |
|--------|--------|---------------|
| admin_confirmation | 1.0 | An admin confirmed the link |
| self_identification | 0.3 | Same handle on different platforms |
| handle_correlation | 0.25 | Similar handles across platforms |
| llm_inference | 0.2 | LLM deduced a connection |
| name_match | 0.15 | Levenshtein similarity > 0.6 |
| project_affinity | 0.15 | Shared project/keyword overlap |
| shared_connections | 0.1 | Jaccard similarity of social neighbors |
| temporal_proximity | 0.05 | Active at similar times |

Multiple signals of the same type have diminishing returns (0.3^n).

### Thresholds

```
Score < 0.15  →  DISCARD (ignore candidate)
Score ≥ 0.25  →  PROPOSE (create EntityLink with status "proposed")
Score ≥ 0.85  →  AUTO_CONFIRM (create confirmed link, still audited)
```

### EntityLink

```
EntityLink {
  entityA, entityB: UUID
  confidence: number
  status: proposed | confirmed | rejected | merged
  signals: ResolutionSignal[]
  proposedBy: "system" | UUID
  confirmedBy?: UUID
}
```

Proposed links expire after 48 hours if not confirmed.

---

## 5. Actions

### MANAGE_IDENTITY (composite)

Infers intent from params and conversation:

| Intent | Trigger | Handler |
|--------|---------|---------|
| **claim** | "my twitter is @foo", platform+handle params | `handleClaimIdentity()` |
| **confirm** | "yes", "sure", no params after agent asks | `handleConfirmIdentity()` |
| **unlink** | "remove my twitter", "disconnect github" | `handleUnlinkIdentity()` |
| **list** | "show my linked accounts", no params | `handleList()` |

**Confirm with no params** (the "sure" case): fetches ALL pending EntityLinks for the speaker and confirms them in one action. This is how a single "sure" after "are you @alice on Twitter?" works — the agent asked, creating context, and confirm sweeps pending links.

### SEND_ADMIN_MESSAGE

Sends a message to the owner/admin. Three urgency levels:

| Urgency | Behavior |
|---------|----------|
| normal | Single message to primary channel |
| important | Message with metadata flag |
| urgent | Triggers EscalationService multi-channel retry loop |

Permission: only the agent itself or admin-role entities can send.

### UPDATE_ROLE

Manual role assignment. Only higher-ranked users can promote. Cannot demote the last OWNER.

---

## 6. Providers (Context Injection)

Each provider injects information into the agent's prompt before it responds.

| Provider | Position | What It Injects |
|----------|----------|-----------------|
| **rolesProvider** | 10 | Speaker's role, lists of owners/admins/users |
| **identityLinksProvider** | 8 | Confirmed cross-platform links for current speaker |
| **pendingLinksProvider** | 9 | Unconfirmed identity matches needing verification |
| **escalationTriggerProvider** | 15 | Active escalations, owner inactivity, pending verifications |
| **activityProfileProvider** | 13 | User activity (last seen, platform, sleep/work cycle) |

The pending links provider is what drives the "are you @alice on Twitter?" question — it injects the pending match into context, and the agent naturally asks about it.

---

## 7. Escalation System

### Trigger Conditions (checked by escalationTriggerProvider)

1. **Active escalation** — unresolved multi-channel retry in progress
2. **Owner inactivity** — owner silent >24 hours during autonomous loops
3. **Pending verifications** — identity links waiting for confirmation

### Multi-Channel Retry (EscalationService)

When `SEND_ADMIN_MESSAGE` fires with urgency "urgent":

1. Send to first configured channel immediately
2. Wait N minutes (default: 5)
3. Check if owner responded
4. If not: send to next channel, wait again
5. Give up after max retries (default: 3)

Configured in `milady.json`:
```json
{
  "agents": {
    "defaults": {
      "escalation": {
        "channels": ["client_chat", "telegram", "discord"],
        "waitMinutes": 5,
        "maxRetries": 3
      }
    }
  }
}
```

---

## 8. Owner Auto-Recognition

When a new entity messages the agent, the evaluator checks if the entity's connector metadata (discord username, telegram ID, etc.) matches any OWNER's declared platform identities. If so:

1. Creates a confirmed identity link (confidence: 1.0, signal: owner_auto_recognition)
2. Propagates the OWNER role to the current world

This is how the owner gets recognized when they message from a different platform — they don't need to re-claim their identity.

---

## 9. End-to-End Flow

```
User message arrives
       │
       ▼
┌─────────────────────┐
│ relationshipExtraction│  ← evaluator runs on every message
│ evaluator            │
│                      │
│ 1. Fetch 15 recent   │
│    messages           │
│ 2. Send to LLM       │
│ 3. Get structured     │
│    extraction         │
│ 4. Check speaker role │
│ 5. Apply trust policy │
│ 6. Store claims       │
│ 7. Trigger resolution │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Entity Resolution    │
│                      │
│ 1. Build 2-hop graph │
│ 2. Score candidates  │
│ 3. < 0.15: discard   │
│    ≥ 0.25: propose   │
│    ≥ 0.85: confirm   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Providers inject     │  ← next message context
│ context              │
│                      │
│ - confirmed links    │
│ - pending links      │
│ - role info          │
│ - escalation state   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Agent responds       │
│                      │
│ Sees pending link →  │
│ "Are you @alice on   │
│  Twitter?"           │
│                      │
│ User: "sure"         │
│                      │
│ → MANAGE_IDENTITY    │
│   intent: confirm    │
│   (no params = sweep │
│    all pending)      │
└─────────────────────┘
```

---

## 10. File Map

```
packages/plugin-roles/src/
  index.ts          Plugin entry, bootstrap (owner sync, admin whitelist)
  types.ts          RoleName, RolesWorldMetadata, ConnectorAdminWhitelist
  utils.ts          checkSenderRole, resolveEntityRole, canModifyRole
  provider.ts       rolesProvider (position 10)
  action.ts         UPDATE_ROLE action

eliza/packages/typescript/src/
  types/index.ts    InformationClaim, EntityLink, ResolutionSignal, ClaimScope, etc.
  utils/
    trustPolicy.ts  getClaimPermissions, createAuditRecord, permission matrix
    platforms.ts    ALL_PLATFORMS, SOCIAL_PLATFORMS, normalizePlatform
  services/
    EntityResolutionService.ts   Small-world graph, signal scoring, thresholds
    RolodexService.ts            Claim/relationship CRUD
    FollowUpService.ts           Follow-up tracking
  evaluators/
    relationshipExtraction.ts    LLM extraction → claims → resolution
    reflection.ts                Facts and relationship extraction
  actions/
    manageIdentity.ts            Composite: claim/confirm/unlink/list
    claimIdentity.ts             Store identity claims
    confirmIdentity.ts           Confirm pending links (no-param sweep)
    unlinkIdentity.ts            Remove identity links
  providers/
    identityLinks.ts             Confirmed links context (position 8)
    pendingLinks.ts              Pending links context (position 9)
    relationships.ts             Relationship context
    facts.ts                     Stored facts context
    contacts.ts                  Contact info context
    followUps.ts                 Follow-up suggestions

packages/agent/src/
  runtime/eliza.ts               Plugin registration
  runtime/eliza-plugin.ts        Provider & action wiring
  actions/send-admin-message.ts  Admin messaging + escalation trigger
  providers/escalation-trigger.ts  Escalation condition detection
  services/escalation.ts         Multi-channel retry loop
  activity-profile/service.ts    User activity tracking
```
