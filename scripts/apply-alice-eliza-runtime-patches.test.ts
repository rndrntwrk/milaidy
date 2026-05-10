import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  applyAliceAppCoreCodingAgentsFallbackPatch,
  applyAliceAppCoreCompanionStagePatch,
  applyAliceAppCoreOpenAccessPatch,
  applyAliceBundledKnowledgeStartupDeferralPatch,
  applyAliceCoreBasicCapabilitiesBrowserSafePatch,
  applyAliceAppViteStubMammothPatch,
  applyAliceCoreBuildBrowserExternalsPatch,
  applyAliceCoreBuildBrowserExternalsMammothPatch,
  applyAliceTelegramAccountAuthResolverPatch,
  applyAliceTelegramSourcePackageJsonExportPatch,
  isAliceTelegramSourcePackageJsonExportPatched,
  applyAliceKubeHealthReadinessPatch,
  applyAliceLifeOpsCalendarActionPatch,
  applyAliceLifeOpsNativeActivityTrackerPatch,
  applyAlicePgliteContainerLockPatch,
  aliceElizaRuntimePatchRelativePath,
  isAliceAppCoreCodingAgentsFallbackPatched,
  isAliceAppCoreCompanionStagePatched,
  isAliceLifeOpsCalendarActionPatched,
  isAliceBundledKnowledgeStartupDeferralPatched,
  isAliceKubeHealthReadinessPatched,
  isAlicePgliteContainerLockPatchPatched,
  isAliceTelegramAccountAuthResolverPatched,
  isAliceRuntimeApiBindPatched,
  rewriteRelativeTsRuntimeSpecifiers,
} from "./apply-alice-eliza-runtime-patches.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

describe("Alice Eliza runtime patch contract", () => {
  it("carries the server-only early API bind and startup contract", () => {
    const patch = readFileSync(
      path.join(repoRoot, aliceElizaRuntimePatchRelativePath),
      "utf8",
    );

    expect(patch).toContain(
      '+      const apiServerHandle = await withStartupPhase(',
    );
    expect(patch).toContain('+        "api-bind",');
    expect(patch).toContain('+            initialAgentState: "starting",');
    expect(patch).toContain(
      "+        apiServerHandle.updateRuntime(currentRuntime);",
    );
    expect(patch).toContain("+        apiServerHandle.updateStartup({");
    expect(patch.indexOf("+        apiServerHandle.updateRuntime(currentRuntime);")).toBeLessThan(
      patch.indexOf('+      startupInfo("start-eliza:done"'),
    );
    expect(patch.indexOf('+      startupInfo("start-eliza:done"')).toBeLessThan(
      patch.indexOf("+      apiServerHandle.updateStartup({"),
    );
    expect(patch).toContain(
      "+        await apiServerHandle.close().catch(() => undefined);",
    );
  });

  it("detects the applied contract in runtime source", () => {
    const source = [
      "logger.info(`[milady][startup] ${event}`);",
      "if (options?.serverOnly) {",
      '      const apiServerHandle = await withStartupPhase(\n        "api-bind"',
      'initialAgentState: "starting"',
      "upstreamStartElizaWithPgliteCompat({",
      "apiServerHandle.updateRuntime(currentRuntime);",
      'startupInfo("start-eliza:done"',
      "apiServerHandle.updateStartup({",
      '        state: "running"',
      "const keepAlive",
    ].join("\n");

    expect(isAliceRuntimeApiBindPatched(source)).toBe(true);
  });

  it("rewrites LifeOps runtime TypeScript specifiers without corrupting multiline imports", () => {
    const source = [
      'import { one } from "./action.ts";',
      'import "./side-effect.ts";',
      'const mod = await import("../dynamic.tsx");',
      "import {",
      "  two,",
      "} from \"../website-blocker/access.ts\";",
      'export * from "./contracts/index.ts";',
      'export type { LifeOpsRouteContext } from "./plugin.ts";',
      'import { external } from "@elizaos/core";',
    ].join("\n");

    expect(rewriteRelativeTsRuntimeSpecifiers(source)).toBe(
      [
        'import { one } from "./action.js";',
        'import "./side-effect.js";',
        'const mod = await import("../dynamic.js");',
        "import {",
        "  two,",
        "} from \"../website-blocker/access.js\";",
        'export * from "./contracts/index.js";',
        'export type { LifeOpsRouteContext } from "./plugin.js";',
        'import { external } from "@elizaos/core";',
      ].join("\n"),
    );
  });

  it("patches source-mode app-core health probes to wait for startup completion", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "alice-kube-health-"));
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const compatPath = path.join(apiDir, "compat-route-shared.ts");
      const serverPath = path.join(apiDir, "server.ts");
      const kubeHealthPath = path.join(apiDir, "kube-health.ts");

      writeFileSync(
        compatPath,
        [
          'import type http from "node:http";',
          'import type { AgentRuntime } from "@elizaos/core";',
          "",
          "export interface CompatRuntimeState {",
          "  current: AgentRuntime | null;",
          "  pendingAgentName: string | null;",
          "  pendingRestartReasons: string[];",
          "}",
        ].join("\n"),
      );
      writeFileSync(
        serverPath,
        [
          'import { sendJson as sendJsonResponse } from "./response";',
          "",
          "export function patchHttpCreateServerForCompat(",
          "  state?: CompatRuntimeState,",
          "): () => void {",
          "  const wrappedListener: http.RequestListener = async (req, res) => {",
          '      if (req.method === "OPTIONS") {',
          "        res.statusCode = 204;",
          "        res.end();",
          "        return;",
          "      }",
          "",
          "      res.on(\"finish\", () => {",
          "        syncElizaEnvAliases();",
          "        syncCompatConfigFiles();",
          "      });",
          "",
          "      if (state) {",
          '        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;',
          "        if (",
          '          pathname.startsWith("/api/database") ||',
          '          pathname.startsWith("/api/trajectories")',
          "        ) {",
          "          await ensureRuntimeSqlCompatibility(state.current);",
          "        }",
          "      }",
          "  };",
          "}",
          "",
          "export async function startApiServer(",
          "  ...args: Parameters<typeof upstreamStartApiServer>",
          "): Promise<Awaited<ReturnType<typeof upstreamStartApiServer>>> {",
          "  const compatState: CompatRuntimeState = {",
          "    current: (args[0]?.runtime as AgentRuntime | null) ?? null,",
          "    pendingAgentName: null,",
          "    pendingRestartReasons: [],",
          "  };",
          "  const server = await upstreamStartApiServer(...args);",
          "",
          "    const originalUpdateRuntime = server.updateRuntime as (",
          "      runtime: AgentRuntime,",
          "    ) => void;",
          "",
          "    server.updateRuntime = (runtime: AgentRuntime) => {",
          "      compatState.current = runtime;",
          "      clearCompatRuntimeRestart(compatState);",
          "      originalUpdateRuntime(runtime);",
          "      void (async () => {",
          "        try {",
          "          await ensureRuntimeSqlCompatibility(runtime);",
          "        } catch {}",
          "      })();",
          "    };",
          "",
          "    syncElizaEnvAliases();",
          "    return server;",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceKubeHealthReadinessPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patchedServer = readFileSync(serverPath, "utf8");
      const patchedCompat = readFileSync(compatPath, "utf8");
      expect(isAliceKubeHealthReadinessPatched(patchedServer, patchedCompat)).toBe(
        true,
      );
      expect(patchedServer).toContain("Boolean(state?.kubeReady)");
      expect(patchedServer).toContain("server.updateStartup = (update) =>");
      expect(patchedServer).toContain("originalUpdateStartup(update)");
      expect(patchedCompat).toContain("kubeReady: boolean");
      expect(readFileSync(kubeHealthPath, "utf8")).toContain(
        "buildKubeHealthResponse",
      );

      expect(
        applyAliceKubeHealthReadinessPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches source-mode app-core with a coding agents empty fallback", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-coding-agents-fallback-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      writeFileSync(
        serverPath,
        [
          "async function handleCompatRoute(",
          "  req,",
          "  res,",
          "  state,",
          ") {",
          "  const method = req.method ?? \"GET\";",
          "  const url = new URL(req.url ?? \"/\", \"http://localhost\");",
          "  // GET /api/agents — return the running agent's info.",
          "  if (method === \"GET\" && url.pathname === \"/api/agents\") {",
          "    if (!(await ensureRouteAuthorized(req, res, state))) {",
          "      return true;",
          "    }",
          "    sendJsonResponse(res, 200, { agents: [] });",
          "    return true;",
          "  }",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAppCoreCodingAgentsFallbackPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(serverPath, "utf8");
      expect(isAliceAppCoreCodingAgentsFallbackPatched(patched)).toBe(true);
      expect(patched).toContain('url.pathname === "/api/coding-agents"');
      expect(patched).toContain("sendJsonResponse(res, 200, []);");

      expect(
        applyAliceAppCoreCodingAgentsFallbackPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches source-mode app-core with companion stage routes", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-companion-stage-routes-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      writeFileSync(
        serverPath,
        [
          'import fs from "node:fs";',
          'import path from "node:path";',
          'import { logger } from "@elizaos/core";',
          "import {",
          "  getConfiguredCompatAgentName,",
          '} from "./compat-route-shared";',
          "",
          "async function handleCompatRoute(",
          "  req,",
          "  res,",
          "  state,",
          ") {",
          "  const method = req.method ?? \"GET\";",
          "  const url = new URL(req.url ?? \"/\", \"http://localhost\");",
          "  if (method === \"GET\" && url.pathname === \"/api/coding-agents\") {",
          "    if (!(await ensureRouteAuthorized(req, res, state))) {",
          "      return true;",
          "    }",
          "    sendJsonResponse(res, 200, []);",
          "    return true;",
          "  }",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAppCoreCompanionStagePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(serverPath, "utf8");
      expect(isAliceAppCoreCompanionStagePatched(patched)).toBe(true);
      expect(patched).toContain('url.pathname === "/api/companion/stage"');
      expect(patched).toContain(
        "/^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/",
      );
      expect(patched).toContain("aliceWriteCompanionStageState(merged)");
      expect(patched).toContain("readCompatJsonBody");

      expect(
        applyAliceAppCoreCompanionStagePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches core basic-capabilities to bypass the plugin-manager barrel for browser safety", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-basic-capabilities-browser-safe-"),
    );
    try {
      const dir = path.join(
        tempDir,
        "packages",
        "core",
        "src",
        "features",
        "basic-capabilities",
      );
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "index.ts");
      const original = [
        "// Re-export plugin-manager security helpers (used by other plugins like",
        "// plugin-app-control to gate owner/admin-only actions without taking a dep",
        "// on @elizaos/agent, which would create a layer cycle).",
        "export {",
        "\tcreatePluginAction,",
        "\thasAdminAccess,",
        "\thasOwnerAccess,",
        "\ttype PluginMode,",
        "\tpluginAction,",
        "\ttype SecurityDeps,",
        '} from "../plugin-manager/index.ts";',
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceCoreBasicCapabilitiesBrowserSafePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      // The exact safe re-export block must be present, pointed at the leaf
      // source file rather than the plugin-manager barrel.
      expect(patched).toContain(
        [
          "export {",
          "\thasAdminAccess,",
          "\thasOwnerAccess,",
          "\ttype SecurityDeps,",
          '} from "../plugin-manager/security.ts";',
        ].join("\n"),
      );
      // The original tab-indented exports of the unsafe symbols must be gone
      // from the source. Comment-text mentions are allowed (and documented).
      expect(patched).not.toContain("\tcreatePluginAction,");
      expect(patched).not.toContain("\tpluginAction,");
      expect(patched).not.toContain("\ttype PluginMode,");
      // The barrel re-export must be gone.
      expect(patched).not.toContain('"../plugin-manager/index.ts"');

      expect(
        applyAliceCoreBasicCapabilitiesBrowserSafePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches core build.ts to externalize fs-extra and graceful-fs in the browser dist", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-core-browser-externals-"),
    );
    try {
      const dir = path.join(tempDir, "packages", "core");
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "build.ts");
      const original = [
        "// Browser-specific externals (these should be provided by the host environment)",
        "const browserExternals = [",
        "\t// These will be loaded via CDN or bundled by the consuming app",
        '\t"sharp", // Image processing - not available in browser',
        '\t"@hapi/shot", // Test utility - not needed in browser',
        "];",
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceCoreBuildBrowserExternalsPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(patched).toContain('"fs-extra", // [milaidy:browser-externals]');
      expect(patched).toContain(
        '"graceful-fs", // [milaidy:browser-externals]',
      );
      // Existing externals must remain.
      expect(patched).toContain('"sharp", // Image processing');
      expect(patched).toContain('"@hapi/shot", // Test utility');

      expect(
        applyAliceCoreBuildBrowserExternalsPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches core build.ts to also externalize mammoth in the browser dist (composes after the fs-extra externalization)", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-core-mammoth-externals-"),
    );
    try {
      const dir = path.join(tempDir, "packages", "core");
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "build.ts");
      // Simulate the post-fs-extra-patch state.
      const original = [
        "// Browser-specific externals (these should be provided by the host environment)",
        "const browserExternals = [",
        "\t// [milaidy:browser-externals] Mark fs-extra and graceful-fs as external...",
        '\t"fs-extra", // [milaidy:browser-externals]',
        '\t"graceful-fs", // [milaidy:browser-externals]',
        "\t// These will be loaded via CDN or bundled by the consuming app",
        '\t"sharp", // Image processing - not available in browser',
        "];",
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceCoreBuildBrowserExternalsMammothPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(patched).toContain(
        '"mammoth", // [milaidy:browser-externals-mammoth]',
      );
      // The fs-extra/graceful-fs sentinels must remain.
      expect(patched).toContain('"fs-extra", // [milaidy:browser-externals]');
      expect(patched).toContain(
        '"graceful-fs", // [milaidy:browser-externals]',
      );
      // sharp must remain.
      expect(patched).toContain('"sharp", // Image processing');

      expect(
        applyAliceCoreBuildBrowserExternalsMammothPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches the app vite native-module-stub-plugin to stub mammoth", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-vite-stub-mammoth-"),
    );
    try {
      const dir = path.join(tempDir, "packages", "app", "vite");
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "native-module-stub-plugin.ts");
      const original = [
        "  const nativePackages = new Set([",
        '    "node-llama-cpp",',
        '    "fs-extra",',
        '    "pty-state-capture",',
        "  ]);",
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceAppViteStubMammothPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(patched).toContain('"mammoth", // [milaidy:vite-stub-mammoth]');
      // Existing entries must remain in order.
      expect(patched).toContain('"node-llama-cpp",');
      expect(patched).toContain('"fs-extra",');
      expect(patched).toContain('"pty-state-capture",');

      expect(
        applyAliceAppViteStubMammothPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches source-mode app-core trusted-local-request with MILADY_OPEN_ACCESS env gate", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-open-access-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const filePath = path.join(apiDir, "trusted-local-request.ts");
      const original = [
        'import type http from "node:http";',
        "",
        "function isCloudProvisionedByEnv(): boolean {",
        '  return process.env.ELIZA_CLOUD_PROVISIONED === "1";',
        "}",
        "",
        "export function isTrustedLocalRequest(",
        '  req: Pick<http.IncomingMessage, "headers" | "socket">,',
        "): boolean {",
        "  if (isCloudProvisionedByEnv()) return false;",
        "  return true;",
        "}",
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceAppCoreOpenAccessPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(patched).toContain(
        'if (process.env.MILADY_OPEN_ACCESS === "1") return true;',
      );
      // The original gate must remain after the new env check.
      expect(patched).toContain("if (isCloudProvisionedByEnv()) return false;");

      expect(
        applyAliceAppCoreOpenAccessPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches source-mode agent startup to defer bundled knowledge seeding", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-knowledge-deferral-"),
    );
    try {
      const runtimeDir = path.join(
        tempDir,
        "packages",
        "agent",
        "src",
        "runtime",
      );
      mkdirSync(runtimeDir, { recursive: true });
      const runtimePath = path.join(runtimeDir, "eliza.ts");
      writeFileSync(
        runtimePath,
        [
          'import { AgentRuntime, logger } from "@elizaos/core";',
          'import { formatError } from "@elizaos/shared";',
          'import { seedBundledKnowledge } from "./default-knowledge.js";',
          'import { runtimeKnowledgeEnabled } from "./native-runtime-features.js";',
          "",
          "function trimEnvString(value: unknown): string | undefined {",
          "  if (typeof value !== \"string\") return undefined;",
          "  return value.trim();",
          "}",
          "",
          "async function initializeRuntimeServices(runtime: AgentRuntime) {",
          "    try {",
          "      if (runtimeKnowledgeEnabled(runtime)) {",
          "        await seedBundledKnowledge(runtime);",
          "      } else {",
          "        logger.info(",
          "          \"[eliza] Native knowledge disabled; skipping bundled knowledge seeding\",",
          "        );",
          "      }",
          "    } catch (err) {",
          "      logger.warn(",
          "        `[eliza] Failed to seed bundled knowledge: ${formatError(err)}`,",
          "      );",
          "    }",
          "}",
          "",
          "async function startApiServer(runtime: AgentRuntime) {",
          "    const dashboardUrl = `http://localhost:3000`;",
          "    logger.info(`[eliza] API server listening on ${dashboardUrl}`);",
          "}",
          "",
          "async function startEliza(opts?: { headless?: boolean }) {",
          "  const runtime = {} as AgentRuntime;",
          "  const loadHooksSystem = async (): Promise<void> => {};",
          "  if (opts?.headless) {",
          "    void loadHooksSystem().catch((err) => {",
          "      logger.warn(`[eliza] Hooks system load failed: ${formatError(err)}`);",
          "    });",
          "    logger.info(",
          "      \"[eliza] Runtime initialised in headless mode (autonomy enabled)\",",
          "    );",
          "    return runtime;",
          "  }",
          "  await initializeRuntimeServices(runtime);",
          "  await startApiServer(runtime);",
          "  return runtime;",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceBundledKnowledgeStartupDeferralPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(runtimePath, "utf8");
      expect(isAliceBundledKnowledgeStartupDeferralPatched(patched)).toBe(true);
      expect(patched).toContain(
        "bundled knowledge seeding deferred until API server startup",
      );
      expect(patched).toContain(
        "bundled knowledge seeding disabled by default during server startup",
      );
      expect(patched).toContain("ALICE_ENABLE_BUNDLED_KNOWLEDGE_SEED");
      expect(patched).toContain(
        'scheduleBundledKnowledgeSeed(runtime, "api-server-listen");',
      );
      expect(patched).toContain(
        'scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");',
      );
      expect(patched).not.toContain("await seedBundledKnowledge(runtime);");

      expect(
        applyAliceBundledKnowledgeStartupDeferralPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches the Eliza resolver so staged LifeOps can import telegram account auth", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-telegram-auth-resolver-"),
    );
    try {
      const resolverDir = path.join(
        tempDir,
        "packages",
        "agent",
        "src",
        "runtime",
      );
      mkdirSync(resolverDir, { recursive: true });
      const resolverPath = path.join(resolverDir, "plugin-resolver.ts");
      writeFileSync(
        resolverPath,
        [
          'import { existsSync } from "node:fs";',
          'import fs from "node:fs/promises";',
          'import path from "node:path";',
          "",
          "const LAST_FAILED_PLUGIN_NAMES = Symbol.for(",
          '  "@elizaos/plugin-resolver/last-failed-plugin-names",',
          ");",
          "",
          "type GlobalWithLastFailedPluginNames = typeof globalThis & {",
          "  [LAST_FAILED_PLUGIN_NAMES]?: string[];",
          "};",
          "",
          "const RUNTIME_APP_PLUGIN_SUBPATHS = new Set([",
          '  "@elizaos/app-lifeops",',
          "]);",
          "",
          "// ---------------------------------------------------------------------------",
          "// Helpers (private)",
          "// ---------------------------------------------------------------------------",
          "",
          "async function stagePluginImportRoot(params: {",
          "  installRoot: string;",
          "  packageName: string;",
          "  packageRoot: string;",
          "  stagedPackageRoot: string;",
          "}): Promise<string> {",
          '  const stagedInstallRoot = "staged";',
          "  await ensureStagedPackageDependencies({",
          "    installRoot: params.installRoot,",
          "    packageName: params.packageName,",
          "    packageRoot: params.packageRoot,",
          "    stagedPackageRoot,",
          "  });",
          "  const shouldLinkHoistedWorkspaceDeps =",
          '    stageAllHoistedNodeModulesEnabled() ||',
          '    params.packageName.startsWith("@elizaos/app-");',
          "  if (shouldLinkHoistedWorkspaceDeps) {",
          "    // hoist links",
          "  }",
          "",
          "  return stagedPackageRoot;",
          "}",
          "",
          "export async function resolvePlugins(): Promise<unknown[]> {",
          "  const plugins: ResolvedPlugin[] = [];",
          "  const failedPlugins: Array<{ name: string; error: string }> = [];",
          "  const repairedInstallRecords = new Set<string>();",
          "",
          "  return plugins;",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceTelegramAccountAuthResolverPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(resolverPath, "utf8");
      expect(isAliceTelegramAccountAuthResolverPatched(patched)).toBe(true);
      expect(patched).toContain(
        "ensureTelegramAccountAuthExportCompat(stagedInstallRoot)",
      );
      expect(patched).toContain(
        "ensureTelegramAccountAuthExportCompat(process.cwd())",
      );
      expect(patched).toContain('exportsMap[TELEGRAM_ACCOUNT_AUTH_EXPORT]');

      expect(
        applyAliceTelegramAccountAuthResolverPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("adds the account-auth-service export to the telegram source package.json", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-telegram-source-pkgjson-"),
    );
    try {
      const pluginDir = path.join(tempDir, "plugins", "plugin-telegram");
      mkdirSync(pluginDir, { recursive: true });
      const packageJsonPath = path.join(pluginDir, "package.json");
      writeFileSync(
        packageJsonPath,
        `${JSON.stringify(
          {
            name: "@elizaos/plugin-telegram",
            main: "./dist/index.js",
            exports: {
              ".": "./dist/index.js",
              "./package.json": "./package.json",
            },
          },
          null,
          2,
        )}\n`,
      );

      expect(
        applyAliceTelegramSourcePackageJsonExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      expect(isAliceTelegramSourcePackageJsonExportPatched(patched)).toBe(true);
      expect(patched.exports["./account-auth-service"]).toBe(
        "./dist/account-auth-service.js",
      );
      expect(patched.exports["."]).toBe("./dist/index.js");
      expect(patched.exports["./package.json"]).toBe("./package.json");

      expect(
        applyAliceTelegramSourcePackageJsonExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips the telegram source package.json patch when the file is absent", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-telegram-source-pkgjson-absent-"),
    );
    try {
      expect(
        applyAliceTelegramSourcePackageJsonExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("skipped");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches the LifeOps calendar umbrella action to avoid child self-reference", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-lifeops-calendar-action-"),
    );
    try {
      const actionsDir = path.join(
        tempDir,
        "plugins",
        "app-lifeops",
        "src",
        "actions",
      );
      mkdirSync(actionsDir, { recursive: true });
      const calendarPath = path.join(actionsDir, "calendar.ts");
      writeFileSync(
        calendarPath,
        [
          'import { calendarAction } from "./lib/calendar-handler.js";',
          "",
          "async function route(target: string) {",
          '  switch (target) {',
          '    case "calendar":',
          "      return (await calendarAction.handler?.(",
          "        runtime,",
          "        message,",
          "        state,",
          "        forwardedOptions,",
          "        delegatedCallback,",
          "      )) as ActionResult;",
          "  }",
          "}",
          "",
          "export const calendarAction = {",
          "  subActions: [",
          "    calendarAction,",
          "    proposeMeetingTimesAction,",
          "  ],",
          "};",
        ].join("\n"),
      );

      expect(
        applyAliceLifeOpsCalendarActionPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(calendarPath, "utf8");
      expect(isAliceLifeOpsCalendarActionPatched(patched)).toBe(true);
      expect(patched).toContain(
        "calendarAction as googleCalendarAction",
      );
      expect(patched).toContain("googleCalendarAction.handler");
      expect(patched).toContain(
        "googleCalendarAction,\n    proposeMeetingTimesAction",
      );

      expect(
        applyAliceLifeOpsCalendarActionPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches plugin-sql PGlite locks for Kubernetes PID reuse", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-pglite-lock-patch-"),
    );
    try {
      const managerDir = path.join(
        tempDir,
        "plugins",
        "plugin-sql",
        "typescript",
        "pglite",
      );
      mkdirSync(managerDir, { recursive: true });
      const managerPath = path.join(managerDir, "manager.ts");
      writeFileSync(
        managerPath,
        [
          "import {",
          "  closeSync,",
          "  existsSync,",
          "  mkdirSync,",
          "  openSync,",
          "  readFileSync,",
          "  unlinkSync,",
          "  writeFileSync,",
          '} from "node:fs";',
          "",
          "type PglitePidFileStatus =",
          '  | "missing"',
          '  | "active"',
          '  | "active-unconfirmed"',
          '  | "cleared-stale"',
          '  | "cleared-malformed"',
          '  | "check-failed";',
          "",
          "export class PGliteClientManager {",
          "  private getLockPid(lockPath: string): number | null {",
          "    try {",
          '      const raw = readFileSync(lockPath, "utf-8");',
          "      const parsed = JSON.parse(raw) as { pid?: unknown };",
          '      return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : null;',
          "    } catch {",
          "      return null;",
          "    }",
          "  }",
          "",
          "  private isPidRunning(pid: number): boolean {",
          "    return pid > 0;",
          "  }",
          "",
          "  private acquireDataDirLockIfNeeded(dataDir: string, lockPath: string): void {",
          "    try {",
          '      openSync(lockPath, "wx");',
          "    } catch (err) {",
          "        const pid = this.getLockPid(lockPath);",
          "        if (pid && this.isPidRunning(pid)) {",
          "          throw this.createActiveLockError(",
          "            dataDir,",
          "            new Error(`PGlite lock file is held by running process ${pid}`)",
          "          );",
          "        }",
          "        unlinkSync(lockPath);",
          "        logger.info(",
          '          { src: "plugin:sql", dataDir, lockPath, pid },',
          '          "Removed stale PGlite lock file"',
          "        );",
          "    }",
          "  }",
          "",
          "  private reconcilePglitePidFile(dataDir: string): PglitePidFileStatus {",
          '    const pidPath = `${dataDir}/postmaster.pid`;',
          '    const content = readFileSync(pidPath, "utf-8");',
          '    const firstLine = content.split("\\n")[0]?.trim();',
          "    const pid = parseInt(firstLine, 10);",
          "    if (Number.isNaN(pid) || pid <= 0) {",
          "      unlinkSync(pidPath);",
          "      return \"cleared-malformed\";",
          "    }",
          "      try {",
          "        process.kill(pid, 0);",
          "        return \"active\";",
          "      } catch {",
          "        return \"cleared-stale\";",
          "      }",
          "  }",
          "",
          "  private createActiveLockError(dataDir: string, cause: unknown): Error {",
          "    return new Error(String(cause));",
          "  }",
          "}",
        ].join("\n"),
      );

      expect(
        applyAlicePgliteContainerLockPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(managerPath, "utf8");
      expect(isAlicePgliteContainerLockPatchPatched(patched)).toBe(true);
      expect(patched).toContain("statSync");
      expect(patched).toContain("previousProcessLock");
      expect(patched).toContain("!previousProcessLock");

      expect(
        applyAlicePgliteContainerLockPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("makes LifeOps native activity tracker imports optional on Linux staging", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-lifeops-native-tracker-"),
    );
    try {
      const sourceDir = path.join(tempDir, "plugins", "app-lifeops", "src");
      const actionsDir = path.join(sourceDir, "actions");
      const activityDir = path.join(sourceDir, "activity-profile");
      mkdirSync(actionsDir, { recursive: true });
      mkdirSync(activityDir, { recursive: true });
      writeFileSync(
        path.join(actionsDir, "screen-time.ts"),
        [
          'import { logger } from "@elizaos/core";',
          'import { isSupportedPlatform } from "@elizaos/native-activity-tracker";',
          "export const supported = isSupportedPlatform();",
        ].join("\n"),
      );
      writeFileSync(
        path.join(activityDir, "activity-tracker-service.ts"),
        [
          'import { logger } from "@elizaos/core";',
          "import {",
          "  type ActivityCollectorEvent,",
          "  type ActivityCollectorHandle,",
          "  type ActivityCollectorIdleSample,",
          "  isSupportedPlatform,",
          "  startActivityCollector,",
          '} from "@elizaos/native-activity-tracker";',
          "async function startCollector() {",
          "    try {",
          "      await LifeOpsRepository.bootstrapSchema(this.runtime);",
          "      this.handle = startActivityCollector({",
          "        onEvent: (event) => this.enqueueEvent(event),",
          "      });",
          "    } catch {}",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceLifeOpsNativeActivityTrackerPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const screenTime = readFileSync(
        path.join(actionsDir, "screen-time.ts"),
        "utf8",
      );
      const service = readFileSync(
        path.join(activityDir, "activity-tracker-service.ts"),
        "utf8",
      );
      const helper = readFileSync(
        path.join(activityDir, "native-activity-tracker.ts"),
        "utf8",
      );

      expect(screenTime).toContain(
        'from "../activity-profile/native-activity-tracker.js";',
      );
      expect(service).toContain('from "./native-activity-tracker.js";');
      expect(service).toContain("const tracker = await loadNativeActivityTracker");
      expect(service).toContain("tracker.startActivityCollector({");
      expect(helper).toContain(
        'import("@elizaos/native-activity-tracker")',
      );
      expect(screenTime).not.toContain("@elizaos/native-activity-tracker");
      expect(service).not.toContain("@elizaos/native-activity-tracker");

      expect(
        applyAliceLifeOpsNativeActivityTrackerPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
