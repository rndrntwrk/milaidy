/**
 * CLOUD-01: Verify that @rndrntwrk/plugin-555stream can load inside the
 * milaidy elizaOS v2 runtime.
 *
 * The published package is already available via npm, but this probe keeps the
 * compatibility gate reproducible from the monorepo workspace. We build a
 * temporary bundle from the local plugin source, import it under the milaidy
 * Bun + @elizaos/core v2 environment, and confirm the runtime accepts the
 * plugin plus its StreamControlService lifecycle.
 */

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(repoRoot, "../555stream/packages/plugin-555stream");
const pluginEntry = path.join(pluginRoot, "src/index.ts");
const tempOutDir = path.join("/tmp", "plugin-555stream-compat-dist");
const tempOutFile = path.join(tempOutDir, "index.js");
export const coreFallbackPaths = [
  path.join(repoRoot, "node_modules/@elizaos/core/dist/node/index.node.js"),
  path.resolve(
    repoRoot,
    "../milaidy/node_modules/@elizaos/core/dist/node/index.node.js"
  ),
];

const requiredEnv = {
  STREAM555_BASE_URL:
    process.env.STREAM555_BASE_URL ?? "https://control.example.test",
  STREAM555_AGENT_TOKEN:
    process.env.STREAM555_AGENT_TOKEN ?? "compat-test-token",
  STREAM555_REQUIRE_APPROVALS:
    process.env.STREAM555_REQUIRE_APPROVALS ?? "true",
};

type CompatPlugin = {
  name?: string;
  actions?: unknown[];
  providers?: unknown[];
  services?: Array<{
    serviceType?: string;
    start?: (runtime: unknown) => Promise<{ serviceType?: string; stop?: () => Promise<void> }>;
  }>;
  routes?: unknown[];
};

export async function buildTemporaryBundle(): Promise<string> {
  await mkdir(tempOutDir, { recursive: true });
  try {
    await execFileAsync(
      "bun",
      [
        "build",
        pluginEntry,
        "--outdir",
        tempOutDir,
        "--target",
        "bun",
        "--format",
        "esm",
        "--sourcemap=external",
      ],
      { cwd: repoRoot }
    );
  } catch (error) {
    const details =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: string }).stderr)
        : "";
    throw new Error(`bun build failed:\n${details}`.trim());
  }

  return tempOutFile;
}

export async function importElizaCore() {
  try {
    return await import("@elizaos/core");
  } catch {
    for (const candidate of coreFallbackPaths) {
      try {
        return await import(pathToFileURL(candidate).href);
      } catch {
        // Try the next path.
      }
    }
  }

  throw new Error(
    `Could not resolve @elizaos/core from package import or fallback paths: ${coreFallbackPaths.join(", ")}`
  );
}

export async function main() {
  console.log("=== 555stream Plugin v2 Compatibility Test ===\n");
  console.log("Workspace:");
  console.log(`  milaidy root: ${repoRoot}`);
  console.log(`  plugin root:  ${pluginRoot}`);

  for (const [key, value] of Object.entries(requiredEnv)) {
    process.env[key] = value;
  }

  console.log("\nBuild step:");
  const bundlePath = await buildTemporaryBundle();
  console.log(`  PASS: temporary bundle built at ${bundlePath}`);

  console.log("\nImport step:");
  const mod = await import(pathToFileURL(bundlePath).href);
  const plugin = (mod.default ?? mod.stream555Plugin) as CompatPlugin | undefined;
  if (!plugin) {
    throw new Error(
      `Temporary bundle loaded but no default or stream555Plugin export was found. Exports: ${Object.keys(mod).join(", ")}`
    );
  }
  console.log("  PASS: plugin bundle imported successfully");

  console.log("\nPlugin shape:");
  console.log(`  name: ${plugin.name ?? "(missing)"}`);
  console.log(`  actions: ${plugin.actions?.length ?? 0}`);
  console.log(`  providers: ${plugin.providers?.length ?? 0}`);
  console.log(`  services: ${plugin.services?.length ?? 0}`);
  console.log(`  routes: ${plugin.routes?.length ?? 0}`);

  const core = await importElizaCore();
  const AgentRuntimeCtor = (core as Record<string, unknown>).AgentRuntime as
    | (new (args: Record<string, unknown>) => unknown)
    | undefined;
  const createCharacter = (core as Record<string, unknown>).createCharacter as
    | ((character: Record<string, unknown>) => Record<string, unknown>)
    | undefined;

  if (!AgentRuntimeCtor) {
    throw new Error("AgentRuntime export is not available from @elizaos/core");
  }

  console.log("\nRuntime constructor check:");
  const character = createCharacter
    ? createCharacter({ name: "CompatTest", bio: "555stream v2 compatibility probe" })
    : { name: "CompatTest", bio: ["555stream v2 compatibility probe"] };
  const runtime = new AgentRuntimeCtor({ character, plugins: [plugin] });
  console.log(`  PASS: AgentRuntime accepted plugin = ${Boolean(runtime)}`);

  console.log("\nService lifecycle check:");
  const serviceClass = plugin.services?.[0];
  if (!serviceClass?.start) {
    throw new Error("Plugin does not expose a startable service class");
  }
  const service = await serviceClass.start({
    getService() {
      return undefined;
    },
  });
  console.log(`  PASS: service initialized with serviceType=${service.serviceType ?? "(missing)"}`);
  await service.stop?.();
  console.log("  PASS: service stopped cleanly");

  console.log("\nResult:");
  console.log("  GO: plugin-555stream is compatible with the milaidy elizaOS v2 runtime.");
  console.log("  No compat shim is required before CLOUD-03.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error("\nFAIL:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
