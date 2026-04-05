import { sql } from "drizzle-orm";
import type { Plugin } from "@elizaos/core";

const REQUIRED_PLUGIN_SCHEMA_TABLES = {
  "@elizaos/plugin-todo": ["todo.todos", "todo.todo_tags"],
  "@elizaos/plugin-goals": ["goals.goals", "goals.goal_tags"],
} as const;

type RequiredPluginName = keyof typeof REQUIRED_PLUGIN_SCHEMA_TABLES;

export interface ResolvedSchemaPlugin {
  name: string;
  plugin: Pick<Plugin, "schema">;
}

export interface MigrationTarget {
  name: RequiredPluginName;
  schema: Record<string, unknown>;
  tables: readonly string[];
}

interface SqlCapableRuntimeLike {
  adapter?: {
    runPluginMigrations?: (
      plugins: Array<{ name: string; schema?: Record<string, unknown> }>,
      options?: {
        verbose?: boolean;
        force?: boolean;
        dryRun?: boolean;
      },
    ) => Promise<void>;
  };
  db: {
    execute: (query: unknown) => Promise<unknown>;
  };
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result.filter(isRecord);
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows.filter(isRecord);
  }
  return [];
}

export function getRequiredSchemaMigrationTargets(
  plugins: ResolvedSchemaPlugin[],
): MigrationTarget[] {
  const targets: MigrationTarget[] = [];
  for (const plugin of plugins) {
    if (!(plugin.name in REQUIRED_PLUGIN_SCHEMA_TABLES)) {
      continue;
    }
    const schema = plugin.plugin.schema;
    if (!isRecord(schema)) {
      continue;
    }
    const name = plugin.name as RequiredPluginName;
    targets.push({
      name,
      schema,
      tables: REQUIRED_PLUGIN_SCHEMA_TABLES[name],
    });
  }
  return targets;
}

export async function listMissingRequiredPluginTables(
  db: SqlCapableRuntimeLike["db"],
  targets: MigrationTarget[],
): Promise<Map<string, string[]>> {
  if (targets.length === 0) {
    return new Map();
  }

  const predicates = targets.flatMap((target) =>
    target.tables.map((qualifiedTable) => {
      const [schemaName, tableName] = qualifiedTable.split(".");
      return `(table_schema = '${schemaName}' AND table_name = '${tableName}')`;
    }),
  );
  const result = await db.execute(
    sql.raw(
      `select table_schema, table_name from information_schema.tables where ${predicates.join(" OR ")}`,
    ),
  );
  const existingTables = new Set(
    extractRows(result).flatMap((row) => {
      const schemaName =
        typeof row.table_schema === "string" ? row.table_schema : null;
      const tableName = typeof row.table_name === "string" ? row.table_name : null;
      return schemaName && tableName ? [`${schemaName}.${tableName}`] : [];
    }),
  );

  const missing = new Map<string, string[]>();
  for (const target of targets) {
    const missingTables = target.tables.filter(
      (qualifiedTable) => !existingTables.has(qualifiedTable),
    );
    if (missingTables.length > 0) {
      missing.set(target.name, [...missingTables]);
    }
  }
  return missing;
}

export async function ensureRequiredPluginSchemas(
  runtime: SqlCapableRuntimeLike,
  plugins: ResolvedSchemaPlugin[],
): Promise<void> {
  if (
    !runtime.adapter ||
    typeof runtime.adapter.runPluginMigrations !== "function"
  ) {
    return;
  }

  const targets = getRequiredSchemaMigrationTargets(plugins);
  if (targets.length === 0) {
    return;
  }

  const missingTables = await listMissingRequiredPluginTables(runtime.db, targets);
  if (missingTables.size === 0) {
    return;
  }

  const targetsToRepair = targets.filter((target) => missingTables.has(target.name));
  runtime.logger?.warn?.(
    `[eliza] Missing plugin schema tables detected: ${targetsToRepair
      .map((target) => `${target.name} [${missingTables.get(target.name)?.join(", ")}]`)
      .join("; ")}. Running targeted migrations.`,
  );

  const isProduction = process.env.NODE_ENV === "production";
  const forceDestructive =
    process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS === "true";
  await runtime.adapter.runPluginMigrations(
    targetsToRepair.map((target) => ({
      name: target.name,
      schema: target.schema,
    })),
    {
      verbose: !isProduction,
      force: forceDestructive,
      dryRun: false,
    },
  );

  const remainingMissing = await listMissingRequiredPluginTables(
    runtime.db,
    targetsToRepair,
  );
  if (remainingMissing.size > 0) {
    throw new Error(
      `Required plugin schema migration did not create expected tables: ${Array.from(
        remainingMissing.entries(),
      )
        .map(([pluginName, tables]) => `${pluginName} [${tables.join(", ")}]`)
        .join("; ")}`,
    );
  }

  runtime.logger?.info?.(
    `[eliza] Repaired missing plugin schemas: ${targetsToRepair
      .map((target) => target.name)
      .join(", ")}`,
  );
}
