import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPluginSqlPgliteContainerPidPatch,
  PLUGIN_PATCH_DIRS,
  resolvePluginDir,
} from "./patch-workspace-plugins.mjs";

describe("PLUGIN_PATCH_DIRS", () => {
  it("maps all expected plugin names to their submodule paths", () => {
    expect(PLUGIN_PATCH_DIRS["plugin-anthropic"]).toBe(
      "plugins/plugin-anthropic",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-google-genai"]).toBe(
      "plugins/plugin-google-genai",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-personality"]).toBe(
      "plugins/plugin-personality",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-agent-skills"]).toBe(
      "plugins/plugin-agent-skills",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-sql"]).toBe("eliza");
  });
});

describe("resolvePluginDir", () => {
  const root = path.resolve(process.cwd(), "test-repo-root");

  it("resolves patch filenames to the correct plugin submodule directory", () => {
    expect(
      resolvePluginDir("plugin-anthropic-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-anthropic"));

    expect(
      resolvePluginDir("plugin-google-genai-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-google-genai"));

    expect(
      resolvePluginDir("plugin-personality-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-personality"));

    expect(
      resolvePluginDir("plugin-agent-skills-crlf-fix.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-agent-skills"));

    expect(
      resolvePluginDir("plugin-sql-pglite-container-pid-reuse.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "eliza"));
  });

  it("returns null for patch files with no matching prefix", () => {
    expect(
      resolvePluginDir("plugin-unknown-some-fix.patch", { rootDir: root }),
    ).toBeNull();

    expect(
      resolvePluginDir("not-a-plugin-patch.patch", { rootDir: root }),
    ).toBeNull();
  });

  it("does not match partial prefix without trailing hyphen", () => {
    // 'plugin-anthropicXYZ.patch' should not resolve to plugin-anthropic
    expect(
      resolvePluginDir("plugin-anthropicXYZ.patch", { rootDir: root }),
    ).toBeNull();
  });
});

describe("applyPluginSqlPgliteContainerPidPatch", () => {
  it("patches plugin-sql source without requiring git metadata", () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), "plugin-sql-patch-"));
    try {
      const managerDir = path.join(
        repo,
        "plugins",
        "plugin-sql",
        "typescript",
        "pglite",
      );
      mkdirSync(managerDir, { recursive: true });
      const managerPath = path.join(managerDir, "manager.ts");
      writeFileSync(
        managerPath,
        `import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

export class PGliteClientManager implements IDatabaseClientManager<PGlite> {
  private getLockPid(lockPath: string): number | null {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as { pid?: unknown };
      return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : null;
    } catch {
      return null;
    }
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  private acquireDataDirLockIfNeeded(): void {
        const pid = this.getLockPid(lockPath);
        if (pid && this.isPidRunning(pid)) {
          throw this.createActiveLockError(
            dataDir,
            new Error(\`PGlite lock file is held by running process \${pid}\`)
          );
        }

        try {
          unlinkSync(lockPath);
          logger.info(
            { src: "plugin:sql", dataDir, lockPath, pid },
            "Removed stale PGlite lock file"
          );
        } catch (unlinkErr) {
          throw this.createActiveLockError(dataDir, unlinkErr);
        }
  }

  private reconcilePglitePidFile(dataDir: string): PglitePidFileStatus {
      try {
        process.kill(pid, 0);
        logger.warn(
          { src: "plugin:sql", dataDir, pid },
          "PGlite data dir is already in use by another process"
        );
        return "active";
      } catch {}
  }
}
`,
      );

      expect(applyPluginSqlPgliteContainerPidPatch(repo)).toBe("applied");
      const patched = readFileSync(managerPath, "utf8");
      expect(patched).toContain("statSync");
      expect(patched).toContain("interface PgliteLockState");
      expect(patched).toContain("private isLockFromPreviousProcess");
      expect(patched).toContain("private isPidFileFromPreviousProcess");
      expect(applyPluginSqlPgliteContainerPidPatch(repo)).toBe(
        "already-applied",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
