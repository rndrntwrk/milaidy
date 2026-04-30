import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapDatabaseSchema } from "./eliza";

const sqlMocks = vi.hoisted(() => ({
  initializeWithDatabase: vi.fn(),
  discoverAndRegisterPluginSchemas: vi.fn(),
  runAllPluginMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@elizaos/plugin-sql", () => ({
  DatabaseMigrationService: class {
    initializeWithDatabase = sqlMocks.initializeWithDatabase;
    discoverAndRegisterPluginSchemas =
      sqlMocks.discoverAndRegisterPluginSchemas;
    runAllPluginMigrations = sqlMocks.runAllPluginMigrations;
  },
}));

describe("bootstrapDatabaseSchema", () => {
  beforeEach(() => {
    sqlMocks.initializeWithDatabase.mockClear();
    sqlMocks.discoverAndRegisterPluginSchemas.mockClear();
    sqlMocks.runAllPluginMigrations.mockClear();
  });

  it("runs plugin-sql migrations against the active runtime database", async () => {
    const runtime = {
      adapter: { db: { execute: vi.fn() } },
    } as any;
    const plugins = [
      { name: "@elizaos/plugin-sql" },
      { name: "@elizaos/plugin-bootstrap" },
      { name: "@rndrntwrk/plugin-555stream" },
    ] as any[];

    await bootstrapDatabaseSchema(runtime, plugins);

    expect(sqlMocks.initializeWithDatabase).toHaveBeenCalledWith(
      runtime.adapter.db,
    );
    expect(sqlMocks.discoverAndRegisterPluginSchemas).toHaveBeenCalledWith(
      plugins,
    );
    expect(sqlMocks.runAllPluginMigrations).toHaveBeenCalledWith({
      verbose: false,
      dryRun: false,
      force: false,
    });
  });

  it("fails fast when the runtime adapter does not expose a db handle", async () => {
    await expect(
      bootstrapDatabaseSchema({ adapter: {} } as any, []),
    ).rejects.toThrow("does not expose a db handle");
  });
});
