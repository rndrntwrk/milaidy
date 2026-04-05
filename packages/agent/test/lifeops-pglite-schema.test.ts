import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }

  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

describe("lifeops repository PGlite schema", () => {
  let db: PGlite | null = null;

  function requireDb(): PGlite {
    if (!db) {
      throw new Error("PGlite test database unavailable");
    }
    return db;
  }

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  it("initializes connector grants and round-trips preferences on PGlite", async () => {
    db = new PGlite();

    const runtime = {
      agentId: "lifeops-pglite-agent",
      character: { name: "lifeops-pglite-agent" },
      getSetting: () => undefined,
      getService: () => null,
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            return requireDb().query(sql);
          },
        },
      },
    } as unknown as IAgentRuntime;

    const repository = new LifeOpsRepository(runtime);
    const grant = createLifeOpsConnectorGrant({
      agentId: "lifeops-pglite-agent",
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "local",
      preferredByAgent: true,
      metadata: {},
      lastRefreshAt: null,
    });

    await repository.upsertConnectorGrant(grant);
    const grants = await repository.listConnectorGrants("lifeops-pglite-agent");

    expect(grants).toHaveLength(1);
    expect(grants[0]?.provider).toBe("google");
    expect(grants[0]?.preferredByAgent).toBe(true);
  });
});
