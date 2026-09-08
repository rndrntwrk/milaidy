type SqlValue = string | number | null;

type RuntimeSqlOperation = {
  operation: "sql.batch";
  ownerId: "alice-owner-production";
  statements: { sql: string; params: SqlValue[] }[];
};

export function validateRuntimeSqlOperation(value: unknown): RuntimeSqlOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("STATE_SQL_OPERATION_INVALID");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).sort().join(",") !== "operation,ownerId,statements" ||
    body.operation !== "sql.batch" || body.ownerId !== "alice-owner-production" ||
    !Array.isArray(body.statements) || body.statements.length < 1 ||
    body.statements.length > 100
  ) throw new Error("STATE_SQL_OPERATION_INVALID");
  for (const statement of body.statements) {
    if (!statement || typeof statement !== "object" || Array.isArray(statement)) {
      throw new Error("STATE_SQL_OPERATION_INVALID");
    }
    const { sql, params } = statement;
    if (
      Object.keys(statement).sort().join(",") !== "params,sql" ||
      typeof sql !== "string" || sql.trim().length === 0 ||
      new TextEncoder().encode(sql).length > 100_000 ||
      !Array.isArray(params) || params.length > 100 ||
      params.some((param) => param !== null && typeof param !== "string" &&
        !(typeof param === "number" && Number.isFinite(param)))
    ) throw new Error("STATE_SQL_OPERATION_INVALID");
    // D1 batch owns atomicity. No ATTACH, manual transaction control, or
    // arbitrary PRAGMA commands can enter through this application route.
    if (!/^\s*(?:SELECT\b|WITH\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b|ALTER\s+TABLE\b|PRAGMA\s+table_info\s*\()/i.test(sql)) {
      const drop = /^\s*DROP TABLE (?:IF EXISTS )?(life_(?:connector_grants|calendar_events|calendar_sync_states|gmail_messages|gmail_sync_states)(?:_next)?)\s*;?\s*$/i.exec(sql);
      if (!drop || body.statements.length < 5) {
        throw new Error("STATE_SQL_STATEMENT_DENIED");
      }
    }
  }
  return body as RuntimeSqlOperation;
}

/** The caller supplies ALICE_RUNTIME_SQL_DB, never the authority state DB. */
export async function executeRuntimeSql(
  db: Pick<D1Database, "prepare" | "batch">,
  operation: RuntimeSqlOperation,
): Promise<{ rows: Record<string, unknown>[] }[]> {
  try {
    const results = await db.batch<Record<string, unknown>>(operation.statements.map(({ sql, params }) =>
      db.prepare(sql).bind(...params)));
    if (results.length !== operation.statements.length ||
      results.some((result) => !result.success || !Array.isArray(result.results))) {
      throw new Error("STATE_SQL_EXECUTION_FAILED");
    }
    return results.map((result) => ({ rows: result.results }));
  } catch (error) {
    // D1 errors may contain SQL literals; never echo those or log them here.
    // The orchestrator recognizes this safe category for idempotent ADD COLUMN.
    if (error instanceof Error && /duplicate column|column .+ already exists/i.test(error.message)) {
      throw new Error("STATE_SQL_DUPLICATE_COLUMN");
    }
    throw new Error("STATE_SQL_EXECUTION_FAILED");
  }
}
