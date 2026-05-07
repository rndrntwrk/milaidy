import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureLifeOpsTables } from "./repository.js";
import { ROUTINE_SEED_TEMPLATES } from "./seed-routines.js";
import { LifeOpsService } from "./service.js";

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

const AGENT_ID = "seed-routines-test-agent";

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

describe("seed routine templates integration", () => {
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

  it("each seed template produces a valid active definition when applied", async () => {
    for (const template of ROUTINE_SEED_TEMPLATES) {
      const result = await service.createDefinition({
        ...template.request,
        timezone: "UTC",
      });

      expect(result.definition.title).toBe(template.title);
      expect(result.definition.status).toBe("active");
      expect(result.definition.cadence.kind).toBe(
        template.request.cadence.kind,
      );
    }

    const all = await service.listDefinitions();
    expect(all).toHaveLength(ROUTINE_SEED_TEMPLATES.length);
  });

  it("applySeedRoutines with all keys creates every template", async () => {
    const allKeys = ROUTINE_SEED_TEMPLATES.map((t) => t.key);
    const ids = await service.applySeedRoutines(allKeys, "UTC");
    expect(ids).toHaveLength(ROUTINE_SEED_TEMPLATES.length);

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(ROUTINE_SEED_TEMPLATES.length);

    const titles = definitions.map((d) => d.definition.title).sort();
    const expectedTitles = ROUTINE_SEED_TEMPLATES.map((t) => t.title).sort();
    expect(titles).toEqual(expectedTitles);
  });

  it("seed definitions have source set to seed", async () => {
    await service.applySeedRoutines(["brush_teeth"], "UTC");

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.definition.source).toBe("seed");
  });

  it("seed definitions preserve priority from template", async () => {
    const template = ROUTINE_SEED_TEMPLATES.find((t) => t.key === "workout");
    expect(template).toBeDefined();

    await service.applySeedRoutines(["workout"], "UTC");

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.definition.priority).toBe(
      template?.request.priority,
    );
  });

  it("seed definitions respect the provided timezone", async () => {
    await service.applySeedRoutines(["stretch"], "America/Chicago");

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.definition.timezone).toBe("America/Chicago");
  });
});
