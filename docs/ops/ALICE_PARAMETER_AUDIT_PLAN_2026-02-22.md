# Alice Parameter Audit Plan (2026-02-22)

## Objective
Create a code-grounded, runtime-verified audit of every operational parameter that affects Alice behavior, reliability, and security in production.

## Scope
This audit covers:

1. Security and trust controls.
2. Auth/session controls.
3. Model routing and credential sourcing.
4. Connector behavior (Discord, Telegram, GitHub).
5. Plugin loading and capability gates.
6. 555 integration surfaces (games, score capture, leaderboard, quests, battles, social, rewards, stream, sw4p).
7. Knowledge/RAG ingestion and retrieval behavior.
8. Persistence/state guarantees (PVCs, runtime state paths).
9. API behavior under load (rate limiting, websocket behavior).
10. Observability and release guardrails.

## Source of Truth
Audit conclusions must be grounded in:

1. Live Kubernetes deployment state (`production/alice-bot`).
2. Live pod startup/runtime logs.
3. Runtime configuration artifacts inside the running container.
4. Code-level parameter surfaces in:
   - `src/api/server.ts`
   - `src/runtime/eliza.ts`
   - `src/runtime/pi-credentials.ts`
   - `src/config/plugin-auto-enable.ts`
   - `src/config/zod-schema.providers-core.ts`

## Methodology
Use a four-pass method:

1. Enumerate parameters.
2. Resolve parameter ownership.
3. Validate runtime effect.
4. Classify risk and remediation priority.

### Pass 1: Enumerate Parameters
Build parameter inventory from:

1. Deployment env definitions.
2. Secret refs and optionality.
3. Runtime config files (`~/.milaidy/milaidy.json`, `~/.eliza/exec-approvals.json`).
4. Code schema surfaces and env/plugin maps.

### Pass 2: Ownership Mapping
For each parameter, map:

1. Producer: where the value is set (K8s secret/config, runtime config, code default).
2. Consumer: which service/plugin/path reads it.
3. Failure mode: what degrades if missing/invalid.

### Pass 3: Runtime Validation
For each high-impact parameter family:

1. Confirm startup behavior in logs.
2. Confirm effective capability from runtime status.
3. Confirm no contradiction between code and runtime.

### Pass 4: Risk Classification
Classify each finding as:

1. `P0`: security exposure, auth breakage, or core capability regression.
2. `P1`: critical feature unavailable or unstable but with workaround.
3. `P2`: drift/quality debt that can become operational incident later.
4. `P3`: documentation/consistency hardening.

## Deliverables
This plan produces:

1. Baseline snapshot report:
   - `docs/ops/ALICE_PARAMETER_AUDIT_BASELINE_2026-02-22.md`
2. Strict implementation checklist:
   - `docs/ops/ALICE_PARAMETER_AUDIT_CHECKLIST_2026-02-22.md`

## Security Requirements (Non-Negotiable)
Security is a first-class parameter domain. Audit must explicitly verify:

1. No required secrets missing.
2. API token auth behavior for non-auth routes.
3. Pairing endpoint throttling and replay handling.
4. Rate limiting posture for API routes vs static assets.
5. Exec approval policy defaults and escalation paths.
6. Trusted admin governance presence/absence.
7. Plugin capability boundaries (especially shell/tool execution).
8. Secret drift (unused secrets, declared-but-missing optional secrets).

## Definition of Done
Audit is done when:

1. All parameter families are enumerated and mapped.
2. High-impact runtime mismatches are identified with evidence.
3. Security controls are explicitly assessed and prioritized.
4. A sequenced checklist exists with pass/fail verification steps.
