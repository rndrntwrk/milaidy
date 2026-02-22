# Alice Parameter Audit Checklist (Strict Priority)

## Execution Rule
Do not mark a line complete without attaching objective evidence (command output, log line, or code diff).

## Current Progress

1. `P0-1` code remediation implemented in `src/runtime/eliza.ts` with test coverage in `src/runtime/eliza.test.ts`.
2. Deployment verification for `P0-1` still pending (must confirm plugin-failure count drops in live logs).

## P0 Blockers (Security + Runtime Integrity)

- [ ] **P0-1 Plugin/package parity**
  - Requirement: every enabled plugin in runtime config must resolve successfully at startup.
  - Current gap: `@elizaos/plugin-babylon`, `@elizaos/plugin-roblox`, `@elizaos/plugin-five55-admin` unresolved.
  - Pass condition: startup logs show `failed=0` for enabled plugin set, or config is updated to disable/remove unresolved entries.

- [ ] **P0-2 Secret contract hardening**
  - Requirement: enforce an explicit required/optional contract for deployment env refs.
  - Current baseline: `required=6`, `missing_required=0`, `missing_optional=49`.
  - Pass condition: required keys validated pre-rollout; optional keys split into `expected_missing` vs `unexpected_missing`.

- [ ] **P0-3 Exec/trust governance baseline**
  - Requirement: explicit runtime governance for privileged operations.
  - Current baseline: `~/.eliza/exec-approvals.json` has empty defaults/agents.
  - Pass condition: explicit approval policy baseline committed and loaded; trust admin strategy documented.

- [ ] **P0-4 API auth/rate-limit safety**
  - Requirement: verify auth and throttling behavior for:
    - `/api/auth/*`
    - authenticated API routes
    - websocket auth paths
  - Pass condition: deterministic test evidence for 401/403/429 behavior with no regressions on normal chat flow.

- [ ] **P0-5 OAuth route integrity**
  - Requirement: OpenAI subscription OAuth path must consistently route through pi-ai credential provider and not degrade to dead-end key expectations.
  - Pass condition: end-to-end chat responses succeed after OAuth login with no manual API-key injection.

## P1 Critical Capability Parity

- [ ] **P1-1 Connector operational parity**
  - Scope: Discord, Telegram, GitHub.
  - Pass condition: each connector proves receive + send + action execution in a recorded smoke test.

- [ ] **P1-2 555 surface invocation parity**
  - Scope: games, score capture, leaderboard, quests, battles, social, rewards, stream, sw4p.
  - Pass condition: each surface has at least one successful tool/action invocation from Alice runtime.

- [ ] **P1-3 Session continuity guarantees**
  - Requirement: opening new UI access points must not unintentionally reset operational context.
  - Pass condition: session continuity behavior documented and verified against persistence rules.

- [ ] **P1-4 Response reliability under load**
  - Requirement: no silent truncation/failure loops when model/tool latency spikes.
  - Pass condition: timeout/retry envelope documented and validated with synthetic slow runs.

## P2 Hardening and Drift Reduction

- [ ] **P2-1 Secret drift cleanup**
  - Requirement: remove or justify `extra_secret_keys` and stale optional refs.
  - Pass condition: secret inventory and deployment refs converge to an intentional set.

- [ ] **P2-2 Config schema isolation**
  - Requirement: address `TodoPlugin` public-schema warnings.
  - Pass condition: plugin tables isolated to intended schema or warning accepted with documented rationale.

- [ ] **P2-3 Capability matrix publication**
  - Requirement: produce machine-readable matrix:
    - parameter -> source -> consumer -> runtime status -> test status.
  - Pass condition: matrix committed and used by deploy checks.

- [ ] **P2-4 Alerting for degraded startup**
  - Requirement: alert if plugin resolution has failed entries or auth providers degrade.
  - Pass condition: startup parse health check wired to fail deployment/smoke when critical failures appear.

## P3 Governance and CI Enforcement

- [ ] **P3-1 Pre-deploy contract checks**
  - Gate on required secrets, plugin/package parity, and auth token presence before rollout.

- [ ] **P3-2 Post-deploy smoke suite**
  - Gate on:
    - API health/readiness
    - connector send/receive
    - one model response roundtrip
    - one 555 action invocation.

- [ ] **P3-3 Audit cadence**
  - Establish weekly parameter drift review with a signed baseline diff.

## Verification Commands (Operator Runbook)

1. Deployment identity:
   - `ssh root@116.202.35.171 "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n production get deploy alice-bot -o=jsonpath='{.spec.template.spec.containers[0].image}'"`
2. Pod readiness:
   - `ssh root@116.202.35.171 "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n production get pods -l app=alice-bot -o wide"`
3. Startup failure scan:
   - `ssh root@116.202.35.171 "KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n production logs deploy/alice-bot --tail=500 | egrep -i 'Plugin resolution complete|Failed plugins|Could not load plugin|Unauthorized|429|Error'" `
4. Runtime approval config:
   - `ssh root@116.202.35.171 "set -e; KUBECONFIG=/etc/rancher/k3s/k3s.yaml; POD=$(kubectl -n production get pods -l app=alice-bot -o jsonpath='{.items[0].metadata.name}'); kubectl -n production exec $POD -- cat /home/node/.eliza/exec-approvals.json"`

## Completion Criteria
Checklist is complete only when:

1. All P0 lines are checked with evidence.
2. No P1 failures remain in the active deployment.
3. P2/P3 work has owners and dates assigned if not completed.
