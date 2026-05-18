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
  applyAliceAppCoreAgentStatusAuthBridgePatch,
  applyAliceAppCoreCodingAgentsFallbackPatch,
  applyAliceAppCoreCompanionStagePatch,
  applyAliceAppCoreDashboardFallbackRoutesPatch,
  applyAliceAppCoreOpenAccessPatch,
  applyAliceAppCoreUpstreamAuthBridgePatch,
  applyAliceAuthRateLimitAfterValidSessionPatch,
  applyAliceProviderFailureNonfatalPatch,
  applyAliceUiAuthGatedStartupPatch,
  applyAliceUiSameOriginWebsocketPatch,
  applyPatchWithGitFallback,
  applyAliceBundledKnowledgeStartupDeferralPatch,
  applyAliceCoreBasicCapabilitiesBrowserSafePatch,
  applyAliceAppViteStubMammothPatch,
  applyAliceCoreBuildBrowserExternalsPatch,
  applyAliceCoreBuildBrowserExternalsMammothPatch,
  applyAliceCoreBrowserValidationReexportPatch,
  applyAlicePluginSqlSchemaPgliteErrorsReexportPatch,
  applyAliceAppPluginRegisterExportPatch,
  isAliceAppPluginRegisterExportPatched,
  applyAliceBrowserBridgeWorkspaceStubPatch,
  isAliceBrowserBridgeWorkspaceStubPatched,
  applyAliceTelegramAccountAuthResolverPatch,
  applyAliceTelegramSourcePackageJsonExportPatch,
  isAliceTelegramSourcePackageJsonExportPatched,
  applyAliceKubeHealthReadinessPatch,
  applyAliceLifeOpsCalendarActionPatch,
  applyAliceLifeOpsNativeActivityTrackerPatch,
  applyAlicePgliteContainerLockPatch,
  aliceElizaRuntimePatchRelativePath,
  isAliceAppCoreCodingAgentsFallbackPatched,
  isAliceAppCoreAgentStatusAuthBridgePatched,
  isAliceAppCoreCompanionStagePatched,
  isAliceAppCoreDashboardFallbackRoutesPatched,
  isAliceAppCoreUpstreamAuthBridgePatched,
  isAliceAuthRateLimitAfterValidSessionPatched,
  isAliceProviderFailureNonfatalPatched,
  isAliceLifeOpsCalendarActionPatched,
  isAliceBundledKnowledgeStartupDeferralPatched,
  isAliceKubeHealthReadinessPatched,
  isAlicePgliteContainerLockPatchPatched,
  isAlicePluginSqlSchemaPgliteErrorsReexportPatched,
  isAliceTelegramAccountAuthResolverPatched,
  isAliceRuntimeApiBindPatched,
  isAliceCoreBrowserValidationReexportPatched,
  isAliceUiAuthGatedStartupPatched,
  isAliceUiSameOriginWebsocketPatched,
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

  it("applies git-format patches when copied Eliza git metadata is unavailable", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "alice-gitless-patch-"));
    try {
      const targetRoot = path.join(tempDir, "eliza");
      mkdirSync(targetRoot, { recursive: true });
      writeFileSync(
        path.join(targetRoot, ".git"),
        "gitdir: ../.git/modules/eliza\n",
      );
      writeFileSync(
        path.join(targetRoot, "sample.ts"),
        ["export const value = 1;", "export const keep = true;"].join("\n"),
      );

      const patchPath = path.join(tempDir, "sample.patch");
      writeFileSync(
        patchPath,
        [
          "diff --git a/sample.ts b/sample.ts",
          "index 1111111111..2222222222 100644",
          "--- a/sample.ts",
          "+++ b/sample.ts",
          "@@ -1,2 +1,2 @@",
          "-export const value = 1;",
          "+export const value = 2;",
          " export const keep = true;",
          "",
          "diff --git a/new-file.ts b/new-file.ts",
          "new file mode 100644",
          "index 0000000000..3333333333",
          "--- /dev/null",
          "+++ b/new-file.ts",
          "@@ -0,0 +1,2 @@",
          "+export const added = true;",
          "+export const ready = true;",
          "",
        ].join("\n"),
      );

      expect(
        applyPatchWithGitFallback({
          patchPath,
          targetRoot,
          driftMessage: "sample patch drifted",
          log: () => undefined,
        }),
      ).toBe("direct");

      expect(readFileSync(path.join(targetRoot, "sample.ts"), "utf8")).toBe(
        ["export const value = 2;", "export const keep = true;", ""].join("\n"),
      );
      expect(readFileSync(path.join(targetRoot, "new-file.ts"), "utf8")).toBe(
        ["export const added = true;", "export const ready = true;", ""].join(
          "\n",
        ),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

  it("patches source-mode app-core to bridge app-core sessions into legacy fallback auth", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-status-auth-bridge-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      const bridgePath = path.join(apiDir, "agent-status-auth-bridge.ts");
      writeFileSync(
        serverPath,
        [
          'import { applyRouteModeGuard } from "../runtime/mode/route-mode-guard";',
          'import { sendJson as sendJsonResponse } from "./response";',
          "export function patchHttpCreateServerForCompat(state) {",
          "  const wrappedListener = async (req, res) => {",
          "      if (state) {",
          '        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;',
          "        if (",
          '          pathname.startsWith("/api/database") ||',
          '          pathname.startsWith("/api/trajectories")',
          "        ) {",
          "          await ensureRuntimeSqlCompatibility(state.current);",
          "        }",
          "",
          "        try {",
          "          if (await handleCompatRoute(req, res, state)) {",
          "            return;",
          "          }",
          "        } catch (err) {",
          "          throw err;",
          "        }",
          "      }",
          "  };",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAppCoreAgentStatusAuthBridgePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patchedServer = readFileSync(serverPath, "utf8");
      const bridgeSource = readFileSync(bridgePath, "utf8");
      expect(
        isAliceAppCoreAgentStatusAuthBridgePatched(
          patchedServer,
          bridgeSource,
        ),
      ).toBe(true);
      expect(patchedServer).toContain(
        'import { authorizeAgentStatusFallback } from "./agent-status-auth-bridge";',
      );
      expect(patchedServer).toContain(
        "if (!(await authorizeAgentStatusFallback(req, res, state)))",
      );
      expect(bridgeSource).toContain(
        "function shouldBridgeAgentFallbackAuth",
      );
      expect(bridgeSource).toContain("UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES");
      expect(bridgeSource).toContain('"/api/agent/autonomy"');
      expect(bridgeSource).toContain('"/api/agent/events"');
      expect(bridgeSource).toContain('"/api/conversations"');
      expect(bridgeSource).toContain('"/api/stream"');
      expect(bridgeSource).toContain('"/api/streaming"');
      expect(bridgeSource).toContain('"/api/logs"');
      expect(bridgeSource).toContain('"/api/companion"');
      expect(bridgeSource).toContain('"/api/apps"');
      expect(bridgeSource).toContain('"/api/browser-workspace"');
      expect(bridgeSource).toContain('"/api/cloud"');
      expect(bridgeSource).toContain('"/api/connectors"');
      expect(bridgeSource).toContain('"/api/inbox"');
      expect(bridgeSource).toContain('"/api/lifeops"');
      expect(bridgeSource).toContain('"/api/triggers"');
      expect(bridgeSource).toContain('"/api/wallet"');
      expect(bridgeSource).toContain("getProvidedApiToken");
      expect(bridgeSource).toContain("tokenMatches");
      expect(bridgeSource).toContain("isAgentApiAuthorized");
      expect(bridgeSource).toContain('pathname === "/api/status"');
      expect(bridgeSource).toContain('pathname === "/api/apps/favorites"');
      expect(bridgeSource).toContain(
        'pathname === "/api/apps/overlay-presence"',
      );
      expect(bridgeSource).toContain('pathname.startsWith("/api/vincent/")');
      expect(bridgeSource).toContain(
        'pathname === "/api/computer-use/approvals"',
      );
      expect(bridgeSource).not.toContain("req.headers.authorization");
      expect(bridgeSource).not.toContain('req.headers["x-api-key"]');

      expect(
        applyAliceAppCoreAgentStatusAuthBridgePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches upstream auth bridge to mutate headers only after app-core fallbacks", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-upstream-auth-bridge-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      const bridgePath = path.join(apiDir, "server-upstream-auth-bridge.ts");
      writeFileSync(
        serverPath,
        [
          'import { handleTrainingBenchmarksRoute } from "./training-benchmarks";',
          "export function patchHttpCreateServerForCompat(state) {",
          "  const wrappedListener = async (req, res) => {",
          "      if (state) {",
          '        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;',
          "        try {",
          "          if (await handleCompatRoute(req, res, state)) {",
          "            return;",
          "          }",
          "        } catch (err) {",
          "          throw err;",
          "        }",
          "      }",
          "  };",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAppCoreUpstreamAuthBridgePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patchedServer = readFileSync(serverPath, "utf8");
      const patchedBridge = readFileSync(bridgePath, "utf8");
      expect(
        isAliceAppCoreUpstreamAuthBridgePatched(
          patchedBridge,
          patchedServer,
        ),
      ).toBe(true);
      expect(patchedServer).toContain(
        'import { bridgeSessionAuthToUpstream } from "./server-upstream-auth-bridge";',
      );
      expect(patchedServer.indexOf("handleCompatRoute(req, res, state)")).toBeLessThan(
        patchedServer.indexOf("bridgeSessionAuthToUpstream(req, res, state, pathname)"),
      );
      expect(patchedBridge).toContain('  "/api/computer-use",');
      expect(patchedBridge).toContain('  "/api/vincent",');
      expect(patchedBridge).toContain('  "/api/apps",');
      expect(patchedBridge).toContain('  "/api/agent/autonomy",');
      expect(patchedBridge).toContain(
        "req.headers.authorization = `Bearer ${upstreamToken}`",
      );

      expect(
        applyAliceAppCoreUpstreamAuthBridgePatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches core browser entry to expose validation helpers", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-core-browser-validation-"),
    );
    try {
      const coreDir = path.join(tempDir, "packages", "core", "src");
      mkdirSync(coreDir, { recursive: true });
      const indexPath = path.join(coreDir, "index.browser.ts");
      writeFileSync(
        indexPath,
        [
          'export * from "./types";',
          'export { logger } from "./logger";',
        ].join("\n"),
      );

      expect(
        applyAliceCoreBrowserValidationReexportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(indexPath, "utf8");
      expect(isAliceCoreBrowserValidationReexportPatched(patched)).toBe(true);
      expect(patched).toContain('export * from "./validation";');

      expect(
        applyAliceCoreBrowserValidationReexportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches app-core provider stream failures to stay nonfatal", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-provider-nonfatal-"),
    );
    try {
      const runtimeDir = path.join(
        tempDir,
        "packages",
        "app-core",
        "src",
        "runtime",
      );
      const cliDir = path.join(
        tempDir,
        "packages",
        "app-core",
        "src",
        "cli",
      );
      mkdirSync(runtimeDir, { recursive: true });
      mkdirSync(cliDir, { recursive: true });
      const errorHandlersPath = path.join(runtimeDir, "error-handlers.ts");
      const devServerPath = path.join(runtimeDir, "dev-server.ts");
      const runMainPath = path.join(cliDir, "run-main.ts");

      writeFileSync(
        errorHandlersPath,
        [
          "export function formatUncaughtError(error: unknown): string {",
          "  if (error instanceof Error) {",
          "    return error.stack ?? error.message;",
          "  }",
          "  return String(error);",
          "}",
          "",
          "function hasInsufficientCreditsSignal(input: string): boolean {",
          "  return /\\b(insufficient(?:[_\\s]+(?:credits?|quota))|insufficient_quota|out of credits|payment required|statuscode:\\s*402)\\b/i.test(",
          "    input,",
          "  );",
          "}",
          "",
          "/**",
          " * Returns `true` when the rejection looks like an AI provider credit-exhaustion",
          " * error — these are noisy but not fatal, so callers should warn instead of crash.",
          " */",
          "export function shouldIgnoreUnhandledRejection(reason: unknown): boolean {",
          "  const formatted = formatUncaughtError(reason);",
          "  if (",
          "    !/AI_NoOutputGeneratedError|No output generated|AI_APICallError|AI_RetryError/i.test(",
          "      formatted,",
          "    )",
          "  ) {",
          "    return false;",
          "  }",
          "",
          "  if (hasInsufficientCreditsSignal(formatted)) {",
          "    return true;",
          "  }",
          "",
          "  const seen = new Set<unknown>();",
          "  let current: unknown = reason;",
          "  while (current && typeof current === \"object\" && !seen.has(current)) {",
          "    seen.add(current);",
          "    current = (current as { cause?: unknown }).cause;",
          "  }",
          "",
          "  return false;",
          "}",
        ].join("\n"),
      );
      const entrypointSource = (importPath) =>
        [
          "import {",
          "  formatUncaughtError,",
          "  shouldIgnoreUnhandledRejection,",
          `} from "${importPath}";`,
          "",
          'process.on("unhandledRejection", (reason) => {',
          "  if (shouldIgnoreUnhandledRejection(reason)) {",
          "    console.warn(",
          "      `${getLogPrefix()} Provider credits appear exhausted; request failed without output. Top up credits and retry.`,",
          "    );",
          "    return;",
          "  }",
          "  console.error(formatUncaughtError(reason));",
          "});",
        ].join("\n");
      writeFileSync(devServerPath, entrypointSource("./error-handlers.js"));
      writeFileSync(runMainPath, entrypointSource("../runtime/error-handlers"));

      expect(
        applyAliceProviderFailureNonfatalPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const errorHandlers = readFileSync(errorHandlersPath, "utf8");
      const devServer = readFileSync(devServerPath, "utf8");
      const runMain = readFileSync(runMainPath, "utf8");
      expect(
        isAliceProviderFailureNonfatalPatched(
          errorHandlers,
          devServer,
          runMain,
        ),
      ).toBe(true);
      expect(errorHandlers).toContain("hasProviderNoOutputSignal");
      expect(errorHandlers).toContain("AI_InvalidPromptError");
      expect(errorHandlers).toContain("return true;");
      expect(devServer).toContain("describeNonFatalUnhandledRejection");
      expect(runMain).toContain("describeNonFatalUnhandledRejection");

      expect(
        applyAliceProviderFailureNonfatalPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches app-core auth to validate sessions before failed-auth throttling", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "alice-auth-rate-"));
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const authPath = path.join(apiDir, "auth.ts");
      writeFileSync(
        authPath,
        [
          "export function ensureCompatApiAuthorized(req, res): boolean {",
          "  const ip = req.socket?.remoteAddress ?? null;",
          "  if (isAuthRateLimited(ip)) {",
          '    sendJsonError(res, 429, "Too many authentication attempts");',
          "    return false;",
          "  }",
          "",
          "  const providedToken = getProvidedApiToken(req);",
          "  if (providedToken && tokenMatches(expectedToken, providedToken)) return true;",
          "",
          "  recordFailedAuth(ip);",
          '  sendJsonError(res, 401, "Unauthorized");',
          "  return false;",
          "}",
          "",
          "export async function ensureCompatApiAuthorizedAsync(req, res, options): Promise<boolean> {",
          "  const ip = req.socket?.remoteAddress ?? null;",
          "  if (isAuthRateLimited(ip)) {",
          '    sendJsonError(res, 429, "Too many authentication attempts");',
          "    return false;",
          "  }",
          "",
          "  if (isTrustedLocalRequest(req)) return true;",
          "",
          '  const method = (req.method ?? "GET").toUpperCase();',
          "  const csrfRequired = !options.skipCsrf && CSRF_REQUIRED_METHODS.has(method);",
          "  if (sessionFromBearer) return true;",
          "",
          "  recordFailedAuth(ip);",
          '  sendJsonError(res, 401, "Unauthorized");',
          "  return false;",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAuthRateLimitAfterValidSessionPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(authPath, "utf8");
      expect(isAliceAuthRateLimitAfterValidSessionPatched(patched)).toBe(true);
      expect(patched.indexOf("const providedToken")).toBeLessThan(
        patched.indexOf("Alice: validate good static bearer tokens"),
      );
      expect(patched.indexOf("if (isTrustedLocalRequest(req)) return true")).toBeLessThan(
        patched.indexOf("Alice: valid local, cookie, and bearer sessions"),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches source-mode app-core with dashboard fallback routes", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-dashboard-fallback-routes-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      const fallbackPath = path.join(apiDir, "dashboard-fallback-routes.ts");
      writeFileSync(
        serverPath,
        [
          'import { applyRouteModeGuard } from "../runtime/mode/route-mode-guard";',
          'import { sendJson as sendJsonResponse } from "./response";',
          "async function handleCompatRoute(",
          "  req,",
          "  res,",
          "  state,",
          ") {",
          "  if (method === \"GET\" && url.pathname === \"/api/config\") {",
          "    sendJsonResponse(res, 200, {});",
          "    return true;",
          "  }",
          "",
          "  return handleDatabaseRowsCompatRoute(req, res, state);",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceAppCoreDashboardFallbackRoutesPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patchedServer = readFileSync(serverPath, "utf8");
      const fallbackSource = readFileSync(fallbackPath, "utf8");
      expect(
        isAliceAppCoreDashboardFallbackRoutesPatched(
          patchedServer,
          fallbackSource,
        ),
      ).toBe(true);
      expect(patchedServer).toContain(
        'import { handleAliceDashboardFallbackRoutes } from "./dashboard-fallback-routes";',
      );
      expect(patchedServer).toContain(
        "if (await handleAliceDashboardFallbackRoutes(req, res, state)) return true;",
      );
      expect(fallbackSource).toContain('pathname === "/api/apps/favorites"');
      expect(fallbackSource).toContain(
        'pathname === "/api/apps/overlay-presence"',
      );
      expect(fallbackSource).toContain('pathname === "/api/vincent/status"');
      expect(fallbackSource).toContain(
        'pathname === "/api/computer-use/approvals"',
      );
      expect(fallbackSource).toContain("runtimeHasRoute");

      expect(
        applyAliceAppCoreDashboardFallbackRoutesPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps password-required startup behind the UI auth gate before hydrating", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-ui-auth-gated-startup-"),
    );
    try {
      const appPath = path.join(tempDir, "packages", "ui", "src", "App.tsx");
      const hooksIndexPath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "hooks",
        "index.ts",
      );
      const startupShellPath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "components",
        "shell",
        "StartupShell.tsx",
      );
      const startupPhasePollPath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "state",
        "startup-phase-poll.ts",
      );
      const onboardingBootstrapPath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "state",
        "onboarding-bootstrap.ts",
      );
      const startupPhaseRuntimePath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "state",
        "startup-phase-runtime.ts",
      );
      const appShellStatePath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "state",
        "useAppShellState.ts",
      );
      const clientAgentPath = path.join(
        tempDir,
        "packages",
        "ui",
        "src",
        "api",
        "client-agent.ts",
      );
      const vincentStatePath = path.join(
        tempDir,
        "plugins",
        "app-vincent",
        "src",
        "useVincentState.ts",
      );

      for (const filePath of [
        appPath,
        hooksIndexPath,
        onboardingBootstrapPath,
        startupShellPath,
        startupPhasePollPath,
        startupPhaseRuntimePath,
        appShellStatePath,
        clientAgentPath,
        vincentStatePath,
      ]) {
        mkdirSync(path.dirname(filePath), { recursive: true });
      }

      writeFileSync(
        onboardingBootstrapPath,
        [
          "export interface ExistingOnboardingProbeClient {",
          "  apiAvailable: boolean;",
          "  getOnboardingStatus: () => Promise<{ complete: boolean }>;",
          "  getConfig: () => Promise<Record<string, unknown> | null | undefined>;",
          "}",
          "",
          "export async function detectExistingOnboardingConnection(args: {",
          "  client: ExistingOnboardingProbeClient;",
          "  timeoutMs: number;",
          "}) {",
          "  if (!args.client.apiAvailable) {",
          "    return null;",
          "  }",
          "",
          '  const timeoutToken = Symbol("onboarding-bootstrap-timeout");',
          "  const status = await args.client.getOnboardingStatus().catch(() => null);",
          "  if (!status) return null;",
          "  const config = await args.client.getConfig().catch(() => null);",
          "  return config ? { detectedExistingInstall: true } : null;",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        startupPhaseRuntimePath,
        [
          'function run(deps, client, dispatch) {',
          "  try {",
          "  } catch (err) {",
          "    const ae = asApiLikeError(err);",
          '      if ((ae?.status === 401 || ae?.status === 429) && client.hasToken()) {',
          "        // 401/429 with a token. Two flavors to distinguish:",
          "        //   1. Genuine port race / pre-bearer endpoint window — /api/auth/status",
          "        //      itself isn't reachable yet. Keep retrying.",
          "        //   2. Bearer-only token (paired but no password session). Server says",
          "        //      /api/auth/status is fine (authenticated:true) but app endpoints",
          "        //      like /api/agent/status still 401, or 429 from the auth rate",
          "        //      limiter on those endpoints. /api/auth/me returns",
          '        //      reason="remote_auth_required". Advance to ready so the auth gate',
          "        //      can render LoginView. Hydrating tolerates 401s.",
          "        try {",
          "          const auth = await client.getAuthStatus();",
          "          const remotePasswordMissing =",
          "            auth.required &&",
          "            auth.loginRequired &&",
          "            auth.passwordConfigured === false;",
          "          if (auth.authenticated || remotePasswordMissing) {",
          "            deps.setOnboardingLoading(false);",
          '            dispatch({ type: "AGENT_RUNNING" });',
          "            return;",
          "          }",
          "        } catch {",
          "          // /api/auth/status itself unreachable — keep retrying.",
          "        }",
          "      }",
          "  }",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        startupPhasePollPath,
        [
          'function poll(deps, client, dispatch, latestAuth) {',
          "      // Token holder, but the server still says auth is required (e.g. the",
          "      // remote owner password has not been set yet, so /api/auth/me will",
          '      // return 401 with reason="remote_password_not_configured"). Don\'t',
          "      // loop polling forever — advance the coordinator to \"ready\" so the",
          "      // top-level auth gate can render LoginView with an actionable",
          '      // "Remote access blocked" message. Without this, the phone is stuck',
          "      // on the splash because every onboarding/runtime endpoint returns 401.",
          "      if (auth.required && !auth.authenticated && client.hasToken()) {",
          "        deps.setAuthRequired(false);",
          "        deps.setOnboardingComplete(true);",
          "        deps.setOnboardingLoading(false);",
          '        dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });',
          "        return;",
          "      }",
          "      if (",
          "        (ae?.status === 401 || ae?.status === 429) &&",
          "        client.hasToken() &&",
          "        latestAuth.authenticated",
          "      ) {",
          "        // Bearer-only token (paired but no password session). /api/auth/status",
          "        // returned authenticated:true but a downstream endpoint",
          "        // (onboarding-status, etc.) still 401s, or the server's auth rate",
          '        // limiter starts returning 429 ("Too many authentication attempts")',
          "        // because every poll re-checks bearer-vs-session. /api/auth/me responds",
          '        // with reason="remote_auth_required" in this state. Don\'t loop forever',
          "        // — advance to ready so the top-level auth gate can render LoginView",
          '        // with an actionable "Sign in" / "Remote access blocked" prompt.',
          "        deps.setAuthRequired(false);",
          "        deps.setOnboardingComplete(true);",
          "        deps.setOnboardingLoading(false);",
          '        dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });',
          "        return;",
          "      }",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        startupShellPath,
        [
          'import { useCallback, useEffect, useRef, useState } from "react";',
          'import { client } from "../../api";',
          'import { useApp } from "../../state";',
          'import { BootstrapStep } from "../onboarding/BootstrapStep";',
          'import { PairingView } from "./PairingView";',
          "",
          "export function StartupShell() {",
          "  const { startupCoordinator } = useApp();",
          "  const phase = startupCoordinator.phase;",
          "  const [showBootstrap, setShowBootstrap] = useState(false);",
          "  const coordinatorDispatchRef = useRef(startupCoordinator.dispatch);",
          "  coordinatorDispatchRef.current = startupCoordinator.dispatch;",
          "  const coordinatorStateRef = useRef(startupCoordinator.state);",
          "  coordinatorStateRef.current = startupCoordinator.state;",
          "",
          "  // Pairing — delegate",
          '  if (phase === "pairing-required") {',
          "    return <PairingView />;",
          "  }",
          "  if (phase === \"onboarding-required\") return <BootstrapStep />;",
          "  return null;",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        appPath,
        [
          "function App() {",
          "  useEffect(() => {",
          '    if (startupCoordinator.phase !== "ready") return;',
          '    if (backendConnection?.state !== "connected") return;',
          "",
          "    const report = () => {",
          '      void fetchWithCsrf("/api/apps/overlay-presence", {',
          '        method: "POST",',
          '        headers: { "Content-Type": "application/json" },',
          "        body: JSON.stringify({ appName: activeOverlayApp }),",
          "      }).catch(() => {",
          "        /* ignore */",
          "      });",
          "    };",
          "",
          "    report();",
          "    const intervalId = window.setInterval(report, 25_000);",
          "    return () => {",
          "      window.clearInterval(intervalId);",
          '      void fetchWithCsrf("/api/apps/overlay-presence", {',
          '        method: "POST",',
          '        headers: { "Content-Type": "application/json" },',
          "        body: JSON.stringify({ appName: null }),",
          "      }).catch(() => {",
          "        /* ignore */",
          "      });",
          "    };",
          "  }, [activeOverlayApp, backendConnection?.state, startupCoordinator.phase]);",
          '    if (authState.phase === "unauthenticated") {',
          "      return (",
          "        <BugReportProvider value={bugReport}>",
          "          <LoginView onLoginSuccess={refetchAuth} reason={authState.reason} />",
          "          <BugReportModal />",
          "        </BugReportProvider>",
          "      );",
          "    }",
          "    // While loading the auth state we allow the main shell to continue",
          "    // rendering (avoids a flash of login screen on refresh when cookies are valid).",
          "  return shellContent;",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        appShellStatePath,
        [
          'import { useCallback, useEffect, useState } from "react";',
          'import { fetchServerFavoriteApps } from "./persistence";',
          "",
          "export function useAppShellState() {",
          "  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});",
          '  const [configText, setConfigText] = useState("");',
          "",
          "  useEffect(() => {",
          "    let cancelled = false;",
          "    void fetchServerFavoriteApps().then((serverApps) => {",
          "      if (cancelled || serverApps == null) return;",
          "      setFavoriteAppsRaw((current) => {",
          "        if (",
          "          current.length === serverApps.length &&",
          "          current.every((entry, idx) => entry === serverApps[idx])",
          "        ) {",
          "          return current;",
          "        }",
          "        return serverApps;",
          "      });",
          "    });",
          "    return () => {",
          "      cancelled = true;",
          "    };",
          "  }, []);",
          "  return null;",
          "}",
        ].join("\n"),
      );

      writeFileSync(
        clientAgentPath,
        [
          'import { ElizaClient } from "./client-base";',
          "",
          "function logSettingsClient(phase, detail) {",
          "  return undefined;",
          "}",
          "",
          "function settingsDebugCloudSummary(cloud) {",
          "  return cloud;",
          "}",
          "",
          "ElizaClient.prototype.getConfig = async function (this: ElizaClient) {",
          '  logSettingsClient("GET /api/config → start", {',
          "    baseUrl: this.getBaseUrl(),",
          "  });",
          '  const r = (await this.fetch("/api/config")) as Record<string, unknown>;',
          "  const cloud = r.cloud as Record<string, unknown> | undefined;",
          '  logSettingsClient("GET /api/config ← ok", {',
          "    baseUrl: this.getBaseUrl(),",
          "    topKeys: Object.keys(r).sort(),",
          "    cloud: settingsDebugCloudSummary(cloud),",
          "  });",
          "  return r;",
          "};",
          "",
          "ElizaClient.prototype.getConfigSchema = async function (this: ElizaClient) {",
          '  return this.fetch("/api/config/schema");',
          "};",
        ].join("\n"),
      );

      writeFileSync(
        hooksIndexPath,
        [
          'export * from "./useActivityEvents";',
          'export * from "./useAutomationDeepLink";',
          "",
        ].join("\n"),
      );

      writeFileSync(
        vincentStatePath,
        [
          'import { openExternalUrl } from "@elizaos/ui";',
          'import { useCallback, useEffect, useRef, useState } from "react";',
          'import { vincentClient } from "./client";',
          "",
          "export function useVincentState({ setActionNotice, t }) {",
          "  const [vincentConnected, setVincentConnected] = useState(false);",
          "  const [vincentLoginBusy, setVincentLoginBusy] = useState(false);",
          "  const busyRef = useRef(false);",
          "  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);",
          "",
          "  const pollVincentStatus = useCallback(async () => {",
          "    try {",
          "      const status = await vincentClient.vincentStatus();",
          "      setVincentConnected(status.connected);",
          "      setVincentConnectedAt(status.connectedAt);",
          "      return status.connected;",
          "    } catch {",
          "      return false;",
          "    }",
          "  }, []);",
          "",
          "  useEffect(() => {",
          "    void pollVincentStatus();",
          "    return () => {",
          "      if (loginPollRef.current) {",
          "        clearInterval(loginPollRef.current);",
          "        loginPollRef.current = null;",
          "      }",
          "    };",
          "  }, [pollVincentStatus]);",
          "",
          "  const handleVincentLogin = useCallback(async () => {",
          "    if (vincentConnected || busyRef.current || vincentLoginBusy) return;",
          "  }, [",
          "    pollVincentStatus,",
          "    setActionNotice,",
          "    t,",
          "    vincentConnected,",
          "    vincentLoginBusy,",
          "  ]);",
          "}",
        ].join("\n"),
      );

      expect(
        applyAliceUiAuthGatedStartupPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patchedSources = {
        appSource: readFileSync(appPath, "utf8"),
        hooksIndexSource: readFileSync(hooksIndexPath, "utf8"),
        onboardingBootstrapSource: readFileSync(
          onboardingBootstrapPath,
          "utf8",
        ),
        startupShellSource: readFileSync(startupShellPath, "utf8"),
        startupPhasePollSource: readFileSync(startupPhasePollPath, "utf8"),
        startupPhaseRuntimeSource: readFileSync(startupPhaseRuntimePath, "utf8"),
        appShellStateSource: readFileSync(appShellStatePath, "utf8"),
        clientAgentSource: readFileSync(clientAgentPath, "utf8"),
        vincentStateSource: readFileSync(vincentStatePath, "utf8"),
      };

      expect(isAliceUiAuthGatedStartupPatched(patchedSources)).toBe(true);
      expect(patchedSources.startupPhaseRuntimeSource).toContain(
        'dispatch({ type: "BACKEND_AUTH_REQUIRED" });',
      );
      expect(patchedSources.onboardingBootstrapSource).toContain(
        "getAuthStatus?: () => Promise",
      );
      expect(patchedSources.onboardingBootstrapSource).toContain(
        "Auth-gated origins must not run protected onboarding probes before a browser session exists.",
      );
      expect(patchedSources.onboardingBootstrapSource).toContain(
        "args.client.hasToken?.() === true",
      );
      expect(
        patchedSources.onboardingBootstrapSource.indexOf("getAuthStatus"),
      ).toBeLessThan(
        patchedSources.onboardingBootstrapSource.indexOf(
          "getOnboardingStatus",
        ),
      );
      expect(patchedSources.startupPhaseRuntimeSource).not.toContain(
        "Advance to ready so the auth gate",
      );
      expect(patchedSources.startupPhasePollSource).not.toContain(
        'dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });',
      );
      expect(patchedSources.startupShellSource).toContain("<LoginView");
      expect(patchedSources.appSource).toContain(
        'data-testid="auth-loading-gate"',
      );
      expect(patchedSources.appShellStateSource).toContain(
        'authState.phase !== "authenticated"',
      );
      expect(patchedSources.clientAgentSource).toContain(
        "GET /api/config → skipped auth-gated browser",
      );
      expect(
        patchedSources.clientAgentSource.indexOf("this.getAuthStatus().catch"),
      ).toBeLessThan(
        patchedSources.clientAgentSource.indexOf('this.fetch("/api/config")'),
      );
      expect(patchedSources.vincentStateSource).toContain(
        "if (!authReady) return false;",
      );

      expect(
        applyAliceUiAuthGatedStartupPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches UI websocket setup to keep same-origin web hosts alive", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "alice-ui-ws-"));
    try {
      const apiDir = path.join(tempDir, "packages", "ui", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const clientBasePath = path.join(apiDir, "client-base.ts");
      writeFileSync(
        clientBasePath,
        [
          "export class ElizaClient {",
          "  private baseUrl?: string;",
          "  setupWebSocket(host: string | null) {",
          "    if (!host) return;",
          "",
          '    // On Capacitor native (iosScheme/androidScheme = "https"), the origin host',
          '    // is a dummy bundle host (e.g. "localhost" with no server behind it).',
          "    // Skip WS if we have no explicit baseUrl and the host doesn't look like a",
          "    // real backend (no port, not an IP, not a known API domain).",
          '    if (!this.baseUrl && typeof host === "string") {',
          '      const hasPort = host.includes(":");',
          "      const isLoopback =",
          '        host.startsWith("127.") || host.startsWith("localhost:");',
          "      if (!hasPort && !isLoopback) return;",
          "    }",
          "",
          "    return host;",
          "  }",
          "}",
        ].join("\n"),
      );

      expect(
        isAliceUiSameOriginWebsocketPatched(
          readFileSync(clientBasePath, "utf8"),
        ),
      ).toBe(false);

      expect(
        applyAliceUiSameOriginWebsocketPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(clientBasePath, "utf8");
      expect(isAliceUiSameOriginWebsocketPatched(patched)).toBe(true);
      expect(patched).toContain(
        "Keep same-origin WS available for real web hosts.",
      );
      expect(patched).toContain(
        "const hasPort = /(?::\\d+|\\]:\\d+)$/.test(normalizedHost);",
      );
      expect(patched).toContain('normalizedHost === "[::1]"');
      expect(patched).not.toContain("host doesn't look like");

      expect(
        applyAliceUiSameOriginWebsocketPatch({
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

  it("recognizes upstream companion stage routes and only restores the local JSON-body import", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-companion-stage-upstream-"),
    );
    try {
      const apiDir = path.join(tempDir, "packages", "app-core", "src", "api");
      mkdirSync(apiDir, { recursive: true });
      const serverPath = path.join(apiDir, "server.ts");
      writeFileSync(
        serverPath,
        [
          "import {",
          "  type CompatRuntimeState,",
          "  clearCompatRuntimeRestart,",
          "  getConfiguredCompatAgentName,",
          '} from "./compat-route-shared";',
          "export {",
          "  readCompatJsonBody,",
          '} from "./compat-route-shared";',
          "const COMPAT_COMPANION_STAGE_DEFAULT = {};",
          'const COMPAT_BROADCAST_STAGE_CHANNELS = new Set(["alice-cam"]);',
          "function compatReadCompanionStageState() { return {}; }",
          "function compatWriteCompanionStageState(next) { return next; }",
          "async function handleCompatCompanionStageRoutes(req, res, state) {",
          '  const url = new URL(req.url ?? "/", "http://localhost");',
          '  if (url.pathname === "/api/companion/stage") return true;',
          "  const publicStageMatch = url.pathname.match(",
          "    /^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/,",
          "  );",
          "  const next = compatReadCompanionStageState();",
          "  compatWriteCompanionStageState(next);",
          "  return Boolean(publicStageMatch);",
          "}",
          "async function handleCompatRoute(req, res, state) {",
          "  if (await handleCompatCompanionStageRoutes(req, res, state)) return true;",
          "  return false;",
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
      expect(patched).toContain("  readCompatJsonBody,");
      expect(patched).not.toContain("const ALICE_COMPANION_STAGE_DEFAULT");

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
        "      const strippedId = id.slice(VIRTUAL_PREFIX.length);",
        '      const modName = strippedId.split("/")[0];',
        '      // fs-extra: CJS module with default + named exports',
        '      if (modName === "fs-extra") {',
        "        return [];",
        "      }",
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
      expect(patched).toContain("// [milaidy:vite-stub-mammoth-loader]");
      expect(patched).toContain(
        "export async function extractRawText() { return emptyResult; }",
      );
      // Existing entries must remain in order.
      expect(patched).toContain('"node-llama-cpp",');
      expect(patched).toContain('"fs-extra",');
      expect(patched).toContain('"pty-state-capture",');
      // Existing fs-extra loader branch must remain after the mammoth branch.
      expect(patched.indexOf('if (modName === "mammoth")')).toBeLessThan(
        patched.indexOf('if (modName === "fs-extra")'),
      );

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

  it("upgrades the app vite mammoth stub to handle virtual module suffixes", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-vite-stub-mammoth-upgrade-"),
    );
    try {
      const dir = path.join(tempDir, "packages", "app", "vite");
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "native-module-stub-plugin.ts");
      const original = [
        "      const strippedId = id.slice(VIRTUAL_PREFIX.length);",
        '      const modName = strippedId.split("/")[0];',
        "      // [milaidy:vite-stub-mammoth-loader]",
        '      if (modName === "mammoth") {',
        "        return [",
        '          "const emptyResult = Object.freeze({ value: \'\', messages: [] });",',
        '          "export async function extractRawText() { return emptyResult; }",',
        '          "export default { extractRawText };",',
        '        ].join("\\n");',
        "      }",
        "      // fs-extra: CJS module with default + named exports",
        '      if (modName === "fs-extra") {',
        "        return [];",
        "      }",
        "    \"mammoth\", // [milaidy:vite-stub-mammoth]",
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAliceAppViteStubMammothPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(patched).toContain(
        'const modName = strippedId.split(/[/?\\0]/)[0];',
      );
      expect(patched).toContain(
        "const mammoth = Object.freeze({ extractRawText });",
      );
      expect(patched).toContain("export { mammoth };");
      expect(patched).toContain("export default mammoth;");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("patches plugin-sql schema index to re-export PGlite error helpers", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-plugin-sql-pglite-errors-"),
    );
    try {
      const dir = path.join(tempDir, "plugins", "plugin-sql", "src", "schema");
      mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "index.ts");
      const original = [
        'export { agentTable } from "./agent";',
        'export { memoryTable } from "./memory";',
      ].join("\n");
      writeFileSync(filePath, original);

      expect(
        applyAlicePluginSqlSchemaPgliteErrorsReexportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      const patched = readFileSync(filePath, "utf8");
      expect(isAlicePluginSqlSchemaPgliteErrorsReexportPatched(patched)).toBe(
        true,
      );
      expect(patched).toContain('export * from "../pglite/errors";');
      // Existing schema exports must remain.
      expect(patched).toContain('export { agentTable } from "./agent";');
      expect(patched).toContain('export { memoryTable } from "./memory";');

      expect(
        applyAlicePluginSqlSchemaPgliteErrorsReexportPatch({
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

  it("adds ./register exports to app-plugin package.json files for static SPA imports", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-app-register-exports-"),
    );
    try {
      const plugins = ["app-wallet", "app-contacts", "app-phone", "app-wifi"];
      for (const plugin of plugins) {
        const pluginDir = path.join(tempDir, "plugins", plugin);
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(
          path.join(pluginDir, "package.json"),
          `${JSON.stringify(
            {
              name: `@elizaos/${plugin}`,
              main: "./dist/index.js",
              exports: { ".": "./dist/index.js" },
            },
            null,
            2,
          )}\n`,
        );
      }

      expect(
        applyAliceAppPluginRegisterExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      for (const plugin of plugins) {
        const patched = JSON.parse(
          readFileSync(
            path.join(tempDir, "plugins", plugin, "package.json"),
            "utf8",
          ),
        );
        expect(isAliceAppPluginRegisterExportPatched(patched)).toBe(true);
        const registerExport = patched.exports["./register"];
        expect(registerExport.import).toBe("./dist/register.js");
        expect(registerExport.default).toBe("./dist/register.js");
        expect(patched.exports["."]).toBe("./dist/index.js");
      }

      expect(
        applyAliceAppPluginRegisterExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips the app-register-exports patch when no app plugins are present", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-app-register-absent-"),
    );
    try {
      expect(
        applyAliceAppPluginRegisterExportPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("skipped");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates a workspace stub for the removed upstream plugin-browser-bridge plugin", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-browser-bridge-stub-"),
    );
    try {
      expect(
        applyAliceBrowserBridgeWorkspaceStubPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("applied");

      expect(isAliceBrowserBridgeWorkspaceStubPatched(tempDir)).toBe(true);

      const stubDir = path.join(tempDir, "plugins", "plugin-browser-bridge");
      const packageJson = JSON.parse(
        readFileSync(path.join(stubDir, "package.json"), "utf8"),
      );
      expect(packageJson.name).toBe("@elizaos/plugin-browser-bridge");
      expect(packageJson.main).toBe("./dist/index.js");
      expect(packageJson.exports["."]).toBe("./dist/index.js");
      expect(packageJson.exports["./contracts"]).toBe("./dist/contracts.js");
      expect(packageJson.exports["./schema"]).toBe("./dist/schema.js");

      // Required by deploy-555-bot-staging.sh container build's
      // `test -f /src/milaidy/eliza/plugins/plugin-browser-bridge/src/index.js`.
      expect(
        readFileSync(path.join(stubDir, "src", "index.js"), "utf8"),
      ).toContain("[milaidy:browser-bridge-stub]");

      // Required entries for materialize_pkg + post-materialize contracts.
      for (const entry of ["dist/index.js", "dist/contracts.js", "dist/schema.js"]) {
        expect(
          readFileSync(path.join(stubDir, entry), "utf8"),
        ).toContain("[milaidy:browser-bridge-stub]");
      }

      expect(
        applyAliceBrowserBridgeWorkspaceStubPatch({
          elizaRoot: tempDir,
          log: () => undefined,
        }),
      ).toBe("already-applied");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips the browser-bridge workspace stub when upstream source is present", () => {
    const tempDir = mkdtempSync(
      path.join(os.tmpdir(), "alice-browser-bridge-present-"),
    );
    try {
      const stubDir = path.join(tempDir, "plugins", "plugin-browser-bridge");
      mkdirSync(stubDir, { recursive: true });
      writeFileSync(
        path.join(stubDir, "package.json"),
        `${JSON.stringify({ name: "@elizaos/plugin-browser-bridge", version: "1.0.0" }, null, 2)}\n`,
      );

      expect(
        applyAliceBrowserBridgeWorkspaceStubPatch({
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
