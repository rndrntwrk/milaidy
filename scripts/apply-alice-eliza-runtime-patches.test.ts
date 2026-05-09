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
  applyAliceBundledKnowledgeStartupDeferralPatch,
  applyAliceTelegramAccountAuthResolverPatch,
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
