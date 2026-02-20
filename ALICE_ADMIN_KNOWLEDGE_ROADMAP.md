# Alice Admin Trust + Knowledge Roadmap

This document defines the implementation path for:

1. Trusted admin control from Telegram/Discord.
2. Persistent identity and organizational knowledge.
3. Safe rollout and verification.

## 1) Trusted Admin Control

Sensitive actions are now gated by trusted-admin checks.

Protected action surfaces:

- `FIVE55_THEME_SET`
- `FIVE55_EVENT_TRIGGER`
- `FIVE55_CABINET_POSSESS`
- `FIVE55_CABINET_RELEASE`
- `FIVE55_QUESTS_CREATE`
- `FIVE55_QUESTS_COMPLETE`
- `FIVE55_REWARDS_ALLOCATE`
- `FIVE55_SOCIAL_ASSIGN_POINTS`
- `FIVE55_LEADERBOARD_WRITE`
- `STREAM_CONTROL`
- `STREAM_SCHEDULE`

### Trust Sources

A caller is trusted when one of these is true:

1. World OWNER trust (existing ownership model).
2. Explicit allowlist match (new provider-aware ID allowlists).
3. Internal agent/system message (autonomous/self-originated action).

### Configuration Keys

Global allowlist:

- `MILAIDY_TRUSTED_ADMIN_IDS`
- `TRUSTED_ADMIN_IDS`

Provider-specific convenience keys:

- `MILAIDY_TRUSTED_ADMIN_TELEGRAM_IDS`
- `MILAIDY_TRUSTED_ADMIN_DISCORD_IDS`
- `MILAIDY_TRUSTED_ADMIN_SLACK_IDS`
- `MILAIDY_TRUSTED_ADMIN_SIGNAL_IDS`
- `MILAIDY_TRUSTED_ADMIN_WHATSAPP_IDS`

Accepted value formats:

- Comma/space-separated IDs: `6689469214, 619816589499432980`
- Provider-qualified entries in global list:
  - `telegram:6689469214`
  - `discord:619816589499432980`

## 2) Configuring in `~/.milaidy/milaidy.json`

Use `env.vars` for persistent runtime env injection.

```json
{
  "env": {
    "vars": {
      "MILAIDY_TRUSTED_ADMIN_TELEGRAM_IDS": "6689469214",
      "MILAIDY_TRUSTED_ADMIN_DISCORD_IDS": "619816589499432980"
    }
  }
}
```

Alternative single global list:

```json
{
  "env": {
    "vars": {
      "MILAIDY_TRUSTED_ADMIN_IDS": "telegram:6689469214,discord:619816589499432980"
    }
  }
}
```

## 3) Identity + Knowledge Hybrid (Recommended)

Use both layers:

1. **Identity layer** (always-on prompt context):
   - `IDENTITY.md` (voice, role, constraints, values)
   - `AGENTS.md` (execution rules)
   - `TOOLS.md` (allowed/expected tools)
2. **Knowledge layer** (RAG retrieval):
   - Ingest ecosystem docs (555, sw4p, stream, ops runbooks, product strategy)
   - Use `/api/knowledge/*` endpoints to add/search/manage corpus.

## 4) Rollout Plan

### Phase A: Trust Gating

1. Set trusted admin IDs in `milaidy.json`.
2. Restart runtime.
3. Verify:
   - Trusted Telegram user can run protected actions.
   - Non-trusted user is denied with trusted-admin error.

### Phase B: Identity Baseline

1. Finalize `IDENTITY.md` with permanent Alice role and operational boundaries.
2. Add `MISSION.md`, `PRODUCT_MAP.md`, `OPERATING_RULES.md` in workspace.
3. Confirm responses reflect identity constraints in chat and external connectors.

### Phase C: Knowledge Corpus

1. Curate source folders and documents.
2. Ingest via knowledge API.
3. Validate retrieval quality on:
   - Product architecture questions
   - Operational procedures
   - Ecosystem cross-repo references

### Phase D: Production Hardening

1. Add periodic ingestion job (incremental updates).
2. Add monitoring for knowledge ingestion failures.
3. Add regression tests for trusted-admin and protected action coverage.

## 5) Acceptance Criteria

- Protected actions are blocked for non-trusted callers.
- Telegram ID `6689469214` can issue privileged commands.
- Identity is stable across restarts.
- Knowledge answers include accurate project context without hardcoded hallucinations.
- No regression in autonomous internal actions.
