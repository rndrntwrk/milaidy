# Alice Parameter Audit Baseline (2026-02-22)

## Snapshot Window
All observations in this baseline were collected from live `production/alice-bot` on 2026-02-22.

## Repository Context
`milaidy` (`alice` branch) currently has pre-existing local changes unrelated to this audit:

1. Modified: `apps/app/src/components/ChatView.tsx`
2. Untracked: `docs/OPENAI_OAUTH_SETTINGS_DISPARITY_AUDIT_2026-02-20.md`
3. Untracked: `docs/ops/autonomy/alice-rag-finetune-remediation-plan-2026-02-21.md`

`555-bot` (`alice` branch) is clean.

## Live Deployment Baseline
Current deployment:

1. Image: `ghcr.io/render-network-os/555-bot:sha-a82ed22`
2. Pod: `alice-bot-6546d7db7f-sj9pq`
3. State: `Running`, `READY=true`, restart count `0`
4. Node: `stream-server`

## Runtime Startup Baseline
Observed in live logs:

1. OpenAI Codex subscription credentials detected for pi-ai runtime.
2. Plugin resolution: `12/15 loaded, 3 failed`.
3. Failed plugins:
   - `@elizaos/plugin-babylon`
   - `@elizaos/plugin-roblox`
   - `@elizaos/plugin-five55-admin`
4. Tooling services started:
   - `ToolPolicyService`
   - `ExecApprovalService`
   - `ActionFilterService`
5. GitHub service authenticated as `rndrntwrk`.
6. API bind active on `0.0.0.0:3000`.

## Security and Secret Baseline

### Secret Inventory vs Deployment References
From live deployment + secret comparison:

1. Total env vars in container spec: `86`
2. Secret refs in env vars: `72`
3. Required secret refs: `6`
4. Optional secret refs: `66`
5. Missing required secret refs: `0`
6. Missing optional secret refs: `49`

Required keys currently satisfied:

1. `ANTHROPIC_API_KEY`
2. `MILAIDY_API_TOKEN`
3. `STREAM555_AGENT_TOKEN`
4. `TWITTER_EMAIL`
5. `TWITTER_PASSWORD`
6. `TWITTER_USERNAME`

Extra keys present in secret but not consumed by deployment env refs:

1. `ELIZA_SERVER_AUTH_TOKEN`
2. `POSTGRES_URL`
3. `STREAM555_API_URL`
4. `STREAM555_BASE_URL`
5. `STREAM555_REQUIRE_APPROVALS`

### API Auth and Rate Limit Controls (Code)
Key auth/rate behavior in `src/api/server.ts`:

1. Rate limiting applied only on `/api` routes, not static assets (`src/api/server.ts:5595`).
2. Unauthorized requests rejected for non-auth endpoints (`src/api/server.ts:5604`).
3. Pairing endpoint has explicit attempt throttling (`src/api/server.ts:5643`).
4. Pairing failure/expiry paths explicitly handled (`src/api/server.ts:5650`).

### Exec Approval and Trust Runtime State
Live file `/home/node/.eliza/exec-approvals.json` indicates:

1. `defaults = {}`
2. `agents = {}`

Implication: no persisted custom approval policy entries are loaded at runtime.

Live `/home/node/.milaidy/milaidy.json` pattern indicates:

1. Plugin entries include `openai`, `anthropic`, `github`, `telegram`, `knowledge`, plus `babylon`, `roblox`, `five55-admin`.
2. No explicit `trustedAdmins`, `execApproval`, `autonomy`, or `sendPolicy` keys present in that file.

## Code Parameter Surfaces (Ground Truth)
Primary code surfaces governing behavior:

1. `src/config/plugin-auto-enable.ts`
   - Env-to-plugin maps for auth and integrations (`src/config/plugin-auto-enable.ts:52`, `src/config/plugin-auto-enable.ts:76`).
2. `src/runtime/eliza.ts`
   - Secret alias normalization (`ALICE_GH_TOKEN <-> GITHUB_API_TOKEN`, `DISCORD_BOT_TOKEN <-> DISCORD_API_TOKEN`) (`src/runtime/eliza.ts:1432`).
   - Connector token detection gates startup requirements (`src/runtime/eliza.ts:1470`).
3. `src/runtime/pi-credentials.ts`
   - pi-ai OAuth/API-key source order and fallback behavior (`src/runtime/pi-credentials.ts:57`).
4. `src/api/server.ts`
   - OpenAI subscription token handling and pi-ai mode configuration (`src/api/server.ts:3400`, `src/api/server.ts:3420`, `src/api/server.ts:3446`).
5. `src/config/zod-schema.providers-core.ts`
   - Tool policy and per-sender policy schema surfaces.

## Findings (Ordered by Severity)

### P0
1. Plugin declaration/runtime package mismatch:
   - `babylon`, `roblox`, and `five55-admin` are declared but not installed in runtime image.
   - Impact: capability expectations diverge from actual runtime and can produce false-positive operator assumptions.

### P1
1. Optional secret drift is large (`49` optional refs missing).
   - Impact: large swaths of integrations silently remain unavailable while deployment still appears healthy.
2. Exec approval policy has no persisted explicit allow/deny entries.
   - Impact: governance expectations can drift from runtime behavior.

### P2
1. Secret/config drift includes unused keys in `alice-secrets`.
   - Impact: operational confusion and harder incident debugging.
2. `TodoPlugin` tables still in public schema according to logs.
   - Impact: weaker logical isolation and longer-term governance debt.

## Immediate Actions Linked
Implementation sequence and verification commands are in:

1. `docs/ops/ALICE_PARAMETER_AUDIT_CHECKLIST_2026-02-22.md`
2. Exhaustive parameter matrix is in:
   - `docs/ops/ALICE_PARAMETER_MATRIX_2026-02-22.md`
