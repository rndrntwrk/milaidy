import { sql, type SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

type SqlResult = { rows: Record<string, unknown>[] };

/** Private D1 SQL used by Life Ops, trajectories and orchestrator stores. */
export function createAliceRuntimeSql(input: {
  ownerId: string;
  fetch?: (request: Request) => Promise<Response>;
}) {
  if (input.ownerId !== "alice-owner-production") {
    throw new Error("ALICE_SQL_OWNER_INVALID");
  }
  const dialect = new SQLiteSyncDialect();
  const send = input.fetch ?? ((request: Request) => fetch(request));
  const batch = async (queries: SQL[]): Promise<SqlResult[]> => {
    const response = await send(new Request(
      "http://alice-state-plane.internal/v1/runtime-sql",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "sql.batch",
          ownerId: input.ownerId,
          statements: queries.map((query) => {
            const { sql, params } = dialect.sqlToQuery(query);
            return { sql, params: params.map((value) =>
              typeof value === "boolean" ? Number(value) : value) };
          }),
        }),
        redirect: "error",
      },
    ));
    const body = await response.json() as { ok?: boolean; code?: string; results?: SqlResult[] };
    if (!response.ok) {
      if (body.code === "STATE_SQL_DUPLICATE_COLUMN") throw new Error("duplicate column");
      throw new Error(`ALICE_SQL_OPERATION_FAILED:${response.status}`);
    }
    if (
      body.ok !== true || !Array.isArray(body.results) ||
      body.results.length !== queries.length ||
      body.results.some((result) => !Array.isArray(result?.rows))
    ) throw new Error("ALICE_SQL_RESPONSE_INVALID");
    return body.results;
  };
  return {
    dialect: "sqlite" as const,
    batch,
    async isReady(): Promise<boolean> {
      const [result] = await batch([sql.raw("SELECT 1 AS ready")]);
      return result?.rows[0]?.ready === 1;
    },
    async execute(query: SQL): Promise<SqlResult> {
      const [result] = await batch([query]);
      if (!result) throw new Error("ALICE_SQL_RESPONSE_INVALID");
      return result;
    },
  };
}
