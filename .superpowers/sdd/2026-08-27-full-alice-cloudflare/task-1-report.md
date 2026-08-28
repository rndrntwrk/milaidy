# Task 1 report — Full Alice runtime profile and UI

## Summary

Task 1 is implemented in commit
`ffb7900d02a2ec635298109a9b1eba7c32a7f6df` (`feat(alice): restore full gated
runtime and UI`). The signed ambient-authority selector remains
`ALICE_RUNTIME_AUTHORITY_MODE=proposer-only`. Runtime composition is now
selected independently and only the byte-exact
`ALICE_RUNTIME_PROFILE=full-gated` value enables the full profile. Missing,
unknown, case-variant, and whitespace-variant profile values retain the
response-only diagnostic composition.

The full profile restores the normal `eliza` bridge, action planning, runtime
plugins, memory, skills, hooks, connectors, optional services, the built Milady
root, Companion, broadcast, static assets, and authenticated product API reads.
The authenticated Access gateway proxies those surfaces without forwarding the
owner JWT, cookies, bearer credentials, or upstream response credentials. Full
chat uses the normal runtime response shape while retaining Cloudflare durable
transcript persistence and pre/post PAUSE and release-proof checks.

Full-profile writes are an exact allowlist. Unknown writes and high-risk
wallet, posting, stream, deploy, merge, sandbox, secret, custody, and WebSocket
surfaces remain denied. The response-only proof, plugin closure, minimal UI,
chat boundary, and durable replay behavior remain available for the explicit
diagnostic composition.

## Changed files

- `packages/agent/src/runtime/alice-runtime-profile.ts`
  - Adds the independent exact authority/composition selectors.
- `packages/agent/src/runtime/eliza.ts`
  - Uses response-only mode only for the diagnostic reduction and restores the
    normal bridge/runtime startup behavior for `full-gated`.
- `packages/agent/src/runtime/alice-production-plugin-policy.ts`
- `packages/agent/src/runtime/alice-production-plugin-policy.test.ts`
  - Keeps the diagnostic closure fail-closed without collapsing the full
    composition.
- `packages/agent/src/runtime/alice-production-startup-guard.test.ts`
  - Proves normal bridge selection and response-only startup isolation.
- `packages/agent/src/api/alice-production-guard.ts`
- `packages/agent/src/api/alice-production-guard.test.ts`
  - Separates composition from authority, restores full read/product paths,
    and exact-allows writes while denying every unreviewed write.
- `packages/agent/src/api/alice-production-proof.ts`
- `packages/agent/src/api/alice-production-proof.test.ts`
  - Adds a sanitized, release-bound full-runtime proof while preserving the
    exact response-only proof.
- `packages/agent/src/api/chat-routes.ts`
- `packages/agent/src/api/__tests__/chat-routes-reply-fallback.test.ts`
- `packages/agent/src/runtime/alice-high-risk-action-boundary.ts`
- `packages/agent/src/api/alice-production-chat.test.ts`
  - Routes full-gated chat through the normal runtime path.
  - Installs a fail-closed execution-path boundary for current privileged action
    aliases, including actions registered after runtime guard installation.
- `packages/agent/src/api/static-file-server.ts`
- `packages/agent/src/api/static-file-server.test.ts`
  - Serves the built UI for Alice without injecting an API bearer token.
- `workers/alice-access-gateway/src/index.ts`
- `workers/alice-access-gateway/test/index.test.ts`
  - Verifies the exact full proof, proxies root/Companion/broadcast/assets and
    authenticated read APIs, preserves durable normal chat, strips credentials,
    rechecks PAUSE/release identity after upstream work, and denies unknown
    writes before runtime ingress.

No Eliza gitlink or nested Eliza content is changed. The setup-generated
`plugins/plugin-telegram/package.json` export was removed with `apply_patch`
before commit and the nested checkout is clean.

## TDD evidence

### Baseline

From `packages/agent`:

```text
bunx vitest run --config vitest.config.ts \
  src/api/alice-production-auth-boundary.test.ts \
  src/api/alice-production-chat.test.ts \
  src/api/alice-production-guard.test.ts \
  src/api/alice-production-proof.test.ts \
  src/api/health-routes.test.ts \
  src/api/static-file-server.test.ts \
  src/runtime/alice-production-plugin-policy.test.ts \
  src/runtime/alice-production-runtime-plugin.test.ts \
  src/runtime/alice-production-startup-guard.test.ts

9 files passed; 48 tests passed.
```

### RED

- The first profile/runtime slice produced six expected failures across five
  files: exact full-profile optional subsystems, normal bridge/plugin closure,
  normal chat routing, and bearer-free static UI.
- The full proof test failed with
  `ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID` before full-proof support existed.
- The authenticated gateway UI test returned `503` for `/` instead of the
  upstream Milady HTML before gateway full-profile proxying existed.
- The full-gated normal chat test returned `503` because durable persistence
  still required the response-only `alice_boundary` shape.
- The bootstrap/product API test returned `403` for authenticated full-profile
  `/api/auth/status`, `/api/config`, and bounded read-query behavior.
- The exact selector test showed whitespace-padded `" full-gated "` incorrectly
  enabled full mode before the selector was made byte-exact.
- The malformed proof test showed a non-string full plugin inventory was
  accepted before exact inventory validation was added.

### GREEN

From `packages/agent` (same focused command as baseline):

```text
9 files passed; 55 tests passed; 0 failed.
```

From `workers/alice-access-gateway`:

```text
bun test test/index.test.ts
29 tests passed; 326 assertions; 0 failed.

bun run typecheck
tsc --project tsconfig.json --noEmit
exit 0.
```

Protected build contract from the repository root:

```text
bun test scripts/build-cloud-agent-workflow.test.mjs
42 tests passed; 0 failed.
```

`git diff --check` passed, the repository is on
`release/alice-full-cloudflare-2026-08-27`, and the implementation commit is
based on protected base `91db832dbb423e360c0be5771fedcebcbbded8e7`.

An additional scoped agent TypeScript diagnostic was run. It still exits 2 on
pre-existing errors in unchanged lines: Vitest mock tuple typing in
`alice-production-chat.test.ts`, an existing `timeoutDuration` option mismatch
in `chat-routes.ts`, existing plugin test fixture typing, and the known missing
`@elizaos/skills` declaration. Task 1 introduced no remaining selector, guard,
proof, static-server, gateway, or runtime-boundary TypeScript diagnostic. The
known frozen-pin `plugin-resolver.test.ts` failure for absent
`@elizaos/plugin-commands` was not masked, modified, or folded into this diff.

## Commit

- Implementation: `ffb7900d02a2ec635298109a9b1eba7c32a7f6df` —
  `feat(alice): restore full gated runtime and UI`
- This report is committed separately so it can record the immutable
  implementation SHA without self-reference.

## Independent review corrections

The four independent-review findings are corrected in source commit
`456515ee73285d5806aa55aa005f11d0f3b079c7` (`fix(alice): close full runtime
review gaps`).

### Correction summary

1. Full-gated chat and runtime plugin registration now install a general Alice
   high-risk action execution boundary. With no independently verified
   capability grant available at this Task 1 runtime boundary, current wallet,
   funds, trade, bridge, signing, public-posting, stream-publication, shell,
   role/admin/credential, app/restart, production merge/deploy, release, and
   risk-change aliases return `ALICE_HIGH_RISK_ACTION_DENIED` without invoking
   their original handler. Safe actions such as `CHECK_BALANCE` still execute.
2. Agent and Access gateway full-profile GET/HEAD admission now use exact
   reviewed allowlists for the Milady root, Companion, broadcast, immutable
   assets, and required boot/read APIs. Unknown future reads including
   `/api/sandbox/browser` and `/api/unreviewed/read` fail closed.
3. The full-runtime proof now emits an exact ordered Task 1 core composition:
   normal Eliza bridge, basic capabilities, core security hooks, SQL memory,
   agent skills, hooks, and connector markers. The gateway rejects missing,
   extra, duplicate, wrong-order, malformed, and case-variant proof entries.
   Additional runtime plugins remain bound by the exact release/image/build
   identity; the complete signed plugin BOM remains Task 2.
4. Durable replay now repeats the post-work admission, release identity, and
   full-profile proof checks after Session context load and before returning a
   previously committed turn.

### Correction TDD evidence

RED evidence captured before each correction:

- Focused chat wallet dispatch called `TRANSFER_TOKEN` once instead of denying
  it: 1 failed, 7 skipped.
- Normal full-gated message dispatch invoked a privileged handler: 1 failed, 8
  skipped.
- The agent guard admitted an unknown full-profile GET and the gateway returned
  200 for it: one focused failure in each layer.
- The agent proof accepted a runtime missing the skills core marker, and the
  gateway accepted partial/extra proof inventories: one focused failure in
  each layer.
- A replay returned 200 after `PAUSE_ALL` became active during Session context
  loading: 1 failed, 29 skipped.

Fresh GREEN evidence after the final correction:

```text
packages/agent focused runtime/UI command:
9 files passed; 56 tests passed; 0 failed.

packages/agent chat action execution command:
1 file passed; 9 tests passed; 0 failed.

workers/alice-access-gateway:
bun test test/index.test.ts
30 tests passed; 363 assertions; 0 failed.

bun run typecheck
tsc --project tsconfig.json --noEmit
exit 0.

repository root:
bun test scripts/build-cloud-agent-workflow.test.mjs
42 tests passed; 0 failed.
```

`git diff --check` passed before the correction commit. A scoped agent
TypeScript diagnostic reported no errors in the new action boundary, production
guard/proof, or focused chat action test. The full agent typecheck retains
unrelated pre-existing test/dependency errors, including the known absent
`@elizaos/skills` declaration; none were masked. The nested Eliza checkout was
clean before commit, including `plugins/plugin-telegram/package.json`.

## Risks and open points

- WebSocket ingress remains fail-closed. No broad `/ws` opening was added
  because this Task 1 source work did not prove a transport-safe upgrade path;
  the plan assigns Container default-`fetch()` WebSocket transport and lifecycle
  proof to Task 4.
- Full authenticated GET/HEAD product APIs are an exact reviewed allowlist
  after full-profile, Access JWT, PAUSE/admission, and release-proof
  verification. Unknown reads, secret/custody-key/WebSocket paths, and
  non-safe writes fail closed.
- Task 1 does not invent capability grants. Until the later independently
  verified grant boundary exists, the covered high-risk runtime handlers are
  denied even when the full profile can plan or describe them.
- This task did not activate connector credentials, public destinations,
  streaming, deployment, provider state, or external infrastructure. Their E2E
  proof remains with later plan tasks.
- No browser/container E2E was run because Task 1 is source runtime/UI behavior
  only and the Container transport/state plane is not yet implemented.

## Deviations

- The plan's eventual `/ws` product acceptance was intentionally not implemented
  in Task 1. This follows the task ruling to avoid a broad WebSocket opening
  without UI/transport proof and preserves the existing fail-closed boundary.
- No other deviations from the Task 1 brief were made.
