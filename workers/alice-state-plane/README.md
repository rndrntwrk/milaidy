# Alice state plane

Private Cloudflare service for Alice's portable durable state contract.

- D1 owns canonical relational records and operation idempotency.
- `AliceStateCoordination` is one SQLite-backed Durable Object per owner/session;
  it owns connection epochs and recovery cursors only.
- Vectorize owns embedding values under an exact index/model/dimension contract;
  D1 owns the canonical record-to-vector reference.
- R2 owns content-addressed bytes; D1 owns immutable object references.
- The Worker has no public route or workers.dev hostname. The Container host must
  call it through a service binding and present `ALICE_STATE_PLANE_SERVICE_TOKEN`.

The adapter intentionally rejects arbitrary SQL and arbitrary callback
transactions. D1 `batch()` backs only the explicit `applyAtomic` operation
group. Production must not select this adapter until every enabled plugin that
directly uses Drizzle/Postgres SQL is converted to a portable operation or is
explicitly classified outside the in-process state contract.

## Known pinned-Eliza conversion gate

The exact pinned Eliza revision `a21d401bf7429bc8c794698b20832512b5315187`
still contains production callers that bypass `IDatabaseAdapter` portability.
At minimum, the following caller families require separate reviewed conversions
before this state plane can replace plugin-sql for the full runtime:

- `packages/app-core/src/api/auth-bootstrap-routes.ts`,
  `auth-session-routes.ts`, `compat-route-shared.ts`, and
  `database-rows-compat-routes.ts` read a Drizzle handle or execute SQL.
- `plugins/plugin-agent-orchestrator/src/services/session-store.ts` and
  `orchestrator-task-store.ts` call `adapter.db.execute` directly.
- `plugins/plugin-scheduling/src/scheduled-task/*` executes raw SQL and migration
  statements.
- `plugins/plugin-todos/src/sql-store.ts` depends on Drizzle callback
  transactions.
- `plugins/plugin-calendar/src/**` uses raw SQL and transaction-specific
  repository helpers.
- `plugins/plugin-personal-assistant/src/lifeops/**` and related activity/blocker
  repositories use raw SQL, migration reruns and transaction helpers.
- `packages/vault/src/pglite-vault.ts` owns a separate PGlite transaction-backed
  secret store and must not be silently mapped into this service.

Until those conversions land, selection is fail-closed: `transaction()` throws
`D1_CALLBACK_TRANSACTION_UNSUPPORTED` and `executeRawSql()` throws
`D1_RAW_SQL_UNSUPPORTED`. This class is therefore a portable Alice state adapter,
not a false claim of complete `IDatabaseAdapter` conformance.
