import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runInitSubmodules } from "./init-submodules.mjs";

describe("runInitSubmodules", () => {
  it("initializes tracked nested eliza submodules individually", () => {
    const rootDir = "/repo";
    const elizaRoot = path.join(rootDir, "eliza");
    const existingPaths = new Set([
      path.join(rootDir, ".git"),
      path.join(rootDir, ".gitmodules"),
      path.join(elizaRoot, ".gitmodules"),
      path.join(elizaRoot, "package.json"),
      path.join(elizaRoot, "packages/typescript/package.json"),
    ]);

    const exec = vi.fn((command: string, options?: { cwd?: string }) => {
      const cwd = options?.cwd ?? rootDir;

      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        if (cwd === rootDir) {
          return "submodule.eliza.path eliza";
        }
        if (cwd === elizaRoot) {
          return [
            "submodule.plugins/plugin-shell.path plugins/plugin-shell",
            "submodule.plugins/plugin-sql.path plugins/plugin-sql",
          ].join("\n");
        }
      }

      if (command === 'git ls-files -s -- "eliza"' && cwd === rootDir) {
        return "160000 deadbeef 0\teliza";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-shell";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-sql"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-sql";
      }

      if (command === 'git submodule status -- "eliza"' && cwd === rootDir) {
        return " 93b4bd488328f39d095cb30d98eb3118a7f28d7c eliza";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-shell";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-sql"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-sql";
      }

      if (command === "git status --porcelain" && cwd === elizaRoot) {
        return "";
      }

      if (command === "git submodule sync --recursive" && cwd === elizaRoot) {
        return "";
      }

      if (
        command ===
          'git submodule update --init --recursive -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "";
      }
      if (
        command ===
          'git submodule update --init --recursive -- "plugins/plugin-sql"' &&
        cwd === elizaRoot
      ) {
        return "";
      }

      throw new Error(`Unexpected command: ${command} (cwd=${cwd})`);
    });

    const result = runInitSubmodules({
      rootDir,
      exec,
      exists: (targetPath) => existingPaths.has(targetPath),
      log: vi.fn(),
      logError: vi.fn(),
    });

    const issuedCommands = exec.mock.calls.map(
      ([command, options]) => `${options?.cwd ?? rootDir} :: ${command}`,
    );

    expect(result.failed).toBe(0);
    expect(
      issuedCommands.some(
        (command) =>
          command.startsWith(`${elizaRoot} :: git `) &&
          command.includes(
            'submodule update --init --recursive -- "plugins/plugin-shell"',
          ),
      ),
    ).toBe(true);
    expect(issuedCommands).not.toContain(
      `${elizaRoot} :: git submodule update --init --recursive`,
    );
  });
});
