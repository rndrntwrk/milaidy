import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureLifeOpsTables } from "../lifeops/repository.js";
import { ROUTINE_SEED_TEMPLATES } from "../lifeops/seed-routines.js";
import { LifeOpsService } from "../lifeops/service.js";

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

const AGENT_ID = "seeding-proactive-test-agent";

function createPgliteRuntime(dbRef: () => PGlite): IAgentRuntime {
  return {
    agentId: AGENT_ID,
    character: { name: AGENT_ID },
    getSetting: () => undefined,
    getService: () => null,
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          return dbRef().query(sql);
        },
      },
    },
  } as unknown as IAgentRuntime;
}

describe("seeding proactive behavior", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let service: LifeOpsService;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(() => db);
    await ensureLifeOpsTables(runtime);
    service = new LifeOpsService(runtime);
  });

  afterEach(async () => {
    await db.close();
  });

  it("checkAndOfferSeeding returns templates when no definitions exist", async () => {
    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(true);
    expect(result.availableTemplates.length).toBeGreaterThan(0);
    expect(result.availableTemplates).toEqual(ROUTINE_SEED_TEMPLATES);
  });

  it("checkAndOfferSeeding returns needsSeeding=false after definitions exist", async () => {
    await service.createDefinition({
      kind: "routine",
      title: "Test routine",
      cadence: { kind: "daily", windows: ["morning"] },
      timezone: "UTC",
    });

    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(false);
    expect(result.availableTemplates).toHaveLength(0);
  });

  it("applySeedRoutines creates real definitions in the database", async () => {
    const keys = ["brush_teeth", "workout"];
    const ids = await service.applySeedRoutines(keys, "America/New_York");
    expect(ids).toHaveLength(2);

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(2);
    const titles = definitions.map((d) => d.definition.title).sort();
    expect(titles).toEqual(["Brush teeth", "Workout"]);
  });

  it("applySeedRoutines marks seeding as offered", async () => {
    await service.applySeedRoutines(["stretch"], "UTC");
    const result = await service.checkAndOfferSeeding();
    // needsSeeding is false because definitions now exist
    expect(result.needsSeeding).toBe(false);
  });

  it("markSeedingOffered prevents future seeding offers even with no definitions", async () => {
    await service.markSeedingOffered();
    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(false);
    expect(result.availableTemplates).toHaveLength(0);
  });
});
