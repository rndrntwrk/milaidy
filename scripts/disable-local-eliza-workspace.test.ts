import {
  existsSync,
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
  disableLocalElizaWorkspace,
  ELIZA_WORKSPACE_GLOB,
  PLUGIN_TYPESCRIPT_WORKSPACE_GLOB,
} from "./disable-local-eliza-workspace.mjs";

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("disableLocalElizaWorkspace", () => {
  it("removes disabled upstream workspaces and rewrites plugin workspace refs to exact versions", () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-disable-local-workspace-"),
    );

    try {
      writeJson(path.join(repoRoot, "package.json"), {
        name: "milady-test",
        workspaces: [
          ELIZA_WORKSPACE_GLOB,
          PLUGIN_TYPESCRIPT_WORKSPACE_GLOB,
          "plugins/*",
          "packages/agent",
        ],
        dependencies: {
          "@elizaos/core": "workspace:*",
          "@elizaos/plugin-agent-orchestrator": "workspace:*",
          "@elizaos/plugin-shell": "workspace:*",
          "@elizaos/plugin-sql": "workspace:*",
        },
        overrides: {
          "@elizaos/core": "2.0.0-alpha.115",
          "@elizaos/plugin-sql": "workspace:*",
        },
      });
      writeJson(
        path.join(
          repoRoot,
          "plugins",
          "plugin-agent-orchestrator",
          "package.json",
        ),
        {
          name: "@elizaos/plugin-agent-orchestrator",
          version: "0.6.2-alpha.0",
        },
      );
      writeJson(
        path.join(
          repoRoot,
          "plugins",
          "plugin-shell",
          "typescript",
          "package.json",
        ),
        {
          name: "@elizaos/plugin-shell",
          version: "2.0.0-alpha.10",
        },
      );
      writeJson(
        path.join(
          repoRoot,
          "plugins",
          "plugin-sql",
          "typescript",
          "package.json",
        ),
        {
          name: "@elizaos/plugin-sql",
          version: "2.0.0-alpha.19",
        },
      );
      writeJson(path.join(repoRoot, "packages", "agent", "package.json"), {
        name: "@miladyai/agent",
        dependencies: {
          "@elizaos/core": "workspace:*",
          "@elizaos/plugin-agent-orchestrator": "workspace:*",
          "@elizaos/plugin-shell": "workspace:*",
          "@elizaos/plugin-sql": "workspace:*",
        },
      });
      writeFileSync(
        path.join(repoRoot, "bun.lock"),
        "# test lockfile\n",
        "utf8",
      );
      mkdirSync(path.join(repoRoot, "eliza"), { recursive: true });

      const result = disableLocalElizaWorkspace(repoRoot, {
        log: () => undefined,
        warn: () => undefined,
        errorLog: () => undefined,
      });

      const rootPkg = JSON.parse(
        readFileSync(path.join(repoRoot, "package.json"), "utf8"),
      ) as {
        workspaces: string[];
        dependencies: Record<string, string>;
        overrides: Record<string, string>;
      };
      const agentPkg = JSON.parse(
        readFileSync(
          path.join(repoRoot, "packages", "agent", "package.json"),
          "utf8",
        ),
      ) as {
        dependencies: Record<string, string>;
      };

      expect(result.removedWorkspaceGlobs).toEqual([
        ELIZA_WORKSPACE_GLOB,
        PLUGIN_TYPESCRIPT_WORKSPACE_GLOB,
      ]);
      expect(result.removedLockfiles).toEqual(["bun.lock"]);
      expect(rootPkg.workspaces).toEqual(["plugins/*", "packages/agent"]);
      expect(rootPkg.dependencies["@elizaos/core"]).toBe("2.0.0-alpha.115");
      expect(rootPkg.dependencies["@elizaos/plugin-sql"]).toBe(
        "2.0.0-alpha.19",
      );
      expect(rootPkg.dependencies["@elizaos/plugin-shell"]).toBe(
        "2.0.0-alpha.10",
      );
      expect(rootPkg.dependencies["@elizaos/plugin-agent-orchestrator"]).toBe(
        "workspace:*",
      );
      expect(rootPkg.overrides["@elizaos/plugin-sql"]).toBe("2.0.0-alpha.19");
      expect(agentPkg.dependencies["@elizaos/core"]).toBe("2.0.0-alpha.115");
      expect(agentPkg.dependencies["@elizaos/plugin-sql"]).toBe(
        "2.0.0-alpha.19",
      );
      expect(agentPkg.dependencies["@elizaos/plugin-shell"]).toBe(
        "2.0.0-alpha.10",
      );
      expect(agentPkg.dependencies["@elizaos/plugin-agent-orchestrator"]).toBe(
        "workspace:*",
      );
      expect(existsSync(path.join(repoRoot, "bun.lock"))).toBe(false);
      expect(existsSync(path.join(repoRoot, ".eliza.ci-disabled"))).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
