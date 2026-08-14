import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OFFICIAL_COLLECTOR =
  "eliza/packages/agent/src/runtime/plugin-collector.ts";
const PRODUCT_PLUGIN_SENTINEL = "// [alice:production-product-plugin-autoload]";
const STREAM_PACKAGE = "@rndrntwrk/plugin-555stream";
const ARCADE_PACKAGE = "@miladyai/agent/plugins/five55-games";

function requireExactlyOnce(contents, anchor, label) {
  const first = contents.indexOf(anchor);
  if (first < 0 || contents.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`collector ${label} anchor drifted`);
  }
  return first;
}

function insertAfter(contents, anchor, addition, label) {
  const index = requireExactlyOnce(contents, anchor, label);
  return `${contents.slice(0, index + anchor.length)}${addition}${contents.slice(index + anchor.length)}`;
}

function productContractPresent(source) {
  return (
    source.includes(PRODUCT_PLUGIN_SENTINEL) &&
    source.includes(`const STREAM555_PLUGIN_PACKAGE = "${STREAM_PACKAGE}";`) &&
    source.includes(`const FIVE55_GAMES_PLUGIN_PACKAGE = "${ARCADE_PACKAGE}";`) &&
    source.includes("function hasStream555RuntimeEnv(") &&
    source.includes("pluginsToLoad.add(STREAM555_PLUGIN_PACKAGE)") &&
    source.includes("pluginsToLoad.add(FIVE55_GAMES_PLUGIN_PACKAGE)")
  );
}

function patchCollector(source) {
  if (source.includes(PRODUCT_PLUGIN_SENTINEL)) {
    if (!productContractPresent(source)) {
      throw new Error("collector product plugin contract is incomplete");
    }
    return source;
  }

  const constantsAnchor =
    "const requireFromPluginCollector = createRequire(import.meta.url);\n";
  const constants = `${PRODUCT_PLUGIN_SENTINEL}
const STREAM555_PLUGIN_PACKAGE = "${STREAM_PACKAGE}";
const FIVE55_GAMES_PLUGIN_PACKAGE = "${ARCADE_PACKAGE}";

type AliceProductConfigEnv = Record<string, unknown> & {
  vars?: Record<string, unknown>;
};
`;
  const constantsIndex = requireExactlyOnce(source, constantsAnchor, "constants");
  let next = `${source.slice(0, constantsIndex)}${constants}${source.slice(constantsIndex)}`;

  const envAnchor = `function isTruthyCloudEnvValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
`;
  const envHelpers = `
function readAliceProductEnvValue(
  configEnv: AliceProductConfigEnv | undefined,
  key: string,
): string | undefined {
  const fromVars =
    configEnv?.vars &&
    typeof configEnv.vars === "object" &&
    !Array.isArray(configEnv.vars)
      ? configEnv.vars[key]
      : undefined;
  const value = process.env[key] ?? fromVars ?? configEnv?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasStream555RuntimeEnv(
  configEnv?: AliceProductConfigEnv,
): boolean {
  const baseUrl = readAliceProductEnvValue(configEnv, "STREAM555_BASE_URL");
  const auth =
    readAliceProductEnvValue(configEnv, "STREAM555_AGENT_API_KEY") ||
    readAliceProductEnvValue(configEnv, "STREAM555_AGENT_TOKEN") ||
    readAliceProductEnvValue(configEnv, "STREAM_API_BEARER_TOKEN");
  return Boolean(baseUrl && auth);
}
`;
  next = insertAfter(next, envAnchor, envHelpers, "environment helper");

  const optionalAnchor = `  ...(shortIdPluginMap as Readonly<Record<string, string>>),
`;
  const optionalAliases = `  "stream555-canonical": STREAM555_PLUGIN_PACKAGE,
  "555stream": STREAM555_PLUGIN_PACKAGE,
  "five55-games": FIVE55_GAMES_PLUGIN_PACKAGE,
`;
  next = insertAfter(
    next,
    optionalAnchor,
    optionalAliases,
    "optional plugin map",
  );

  const configEnvAnchor = `  const _configEnv = config.env as
    | (Record<string, unknown> & { vars?: Record<string, unknown> })
    | undefined;
`;
  requireExactlyOnce(next, configEnvAnchor, "config env");
  next = next.replace(
    configEnvAnchor,
    `  const _configEnv = config.env as AliceProductConfigEnv | undefined;
`,
  );
  if (next.includes(configEnvAnchor)) {
    throw new Error("collector config env anchor drifted");
  }

  const disabledAnchor = `  const isPluginExplicitlyDisabled = (pluginPackageName: string): boolean => {
    const marker = "/plugin-";
    const markerIndex = pluginPackageName.lastIndexOf(marker);
    const pluginId =
      markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    return pluginEntries?.[pluginId]?.enabled === false;
  };
`;
  const disabledHelpers = `
  const isAliceProductPluginExplicitlyDisabled = (
    pluginPackageName: string,
    aliases: readonly string[],
  ): boolean =>
    isPluginExplicitlyDisabled(pluginPackageName) ||
    aliases.some((alias) => pluginEntries?.[alias]?.enabled === false);
`;
  next = insertAfter(
    next,
    disabledAnchor,
    disabledHelpers,
    "disablement",
  );

  const connectorAnchor = `  // Connector plugins — load when connector has config entries
`;
  const autoload = `  if (hasStream555RuntimeEnv(_configEnv)) {
    if (
      !isAliceProductPluginExplicitlyDisabled(STREAM555_PLUGIN_PACKAGE, [
        "stream555-canonical",
        "555stream",
      ])
    ) {
      pluginsToLoad.add(STREAM555_PLUGIN_PACKAGE);
      track(STREAM555_PLUGIN_PACKAGE, "env: STREAM555_BASE_URL + stream auth");
    }
    if (
      !isAliceProductPluginExplicitlyDisabled(FIVE55_GAMES_PLUGIN_PACKAGE, [
        "five55-games",
      ])
    ) {
      pluginsToLoad.add(FIVE55_GAMES_PLUGIN_PACKAGE);
      track(FIVE55_GAMES_PLUGIN_PACKAGE, "env: STREAM555_BASE_URL + stream auth");
    }
  }

`;
  next = `${next.slice(0, requireExactlyOnce(next, connectorAnchor, "connector"))}${autoload}${next.slice(requireExactlyOnce(next, connectorAnchor, "connector"))}`;

  if (!productContractPresent(next)) {
    throw new Error("collector product plugin contract is incomplete");
  }
  return next;
}

export async function portAliceProductPlugins(root = process.cwd()) {
  const collectorPath = path.join(root, OFFICIAL_COLLECTOR);
  await access(collectorPath);
  const before = await readFile(collectorPath, "utf8");
  const after = patchCollector(before);
  if (after !== before) {
    await writeFile(collectorPath, after);
  }
  process.stdout.write(
    "Ported Alice Stream, Ads, and Arcade plugin autoload into official Eliza.\n",
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  await portAliceProductPlugins();
}
