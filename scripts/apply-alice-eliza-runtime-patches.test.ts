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
  applyAliceLifeOpsNativeActivityTrackerPatch,
  aliceElizaRuntimePatchRelativePath,
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
