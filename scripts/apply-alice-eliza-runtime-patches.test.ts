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
  applyAliceTelegramAccountAuthResolverPatch,
  applyAliceLifeOpsCalendarActionPatch,
  applyAliceLifeOpsNativeActivityTrackerPatch,
  applyAlicePgliteContainerLockPatch,
  aliceElizaRuntimePatchRelativePath,
  isAliceLifeOpsCalendarActionPatched,
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
      "apiServerHandle.updateStartup({",
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
