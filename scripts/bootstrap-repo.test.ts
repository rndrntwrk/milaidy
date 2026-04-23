import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { bootstrapRepo, getBootstrapInstallArgs } from "./bootstrap-repo.mjs";

describe("getBootstrapInstallArgs", () => {
  it("always skips lifecycle scripts during the initial bootstrap install", () => {
    expect(getBootstrapInstallArgs()).toEqual(["install", "--ignore-scripts"]);
  });
});

describe("bootstrapRepo", () => {
  it("initializes submodules before running install and repo setup", async () => {
    const repoRoot = "/repo";
    const repoSetupScript = path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "scripts",
      "run-repo-setup.mjs",
    );
    const commands: Array<{
      command: string;
      args: string[];
      cwd: string;
      label: string | undefined;
    }> = [];
    const runCommandImpl = vi.fn(
      async (
        command: string,
        args: string[],
        options?: {
          cwd?: string;
          env?: NodeJS.ProcessEnv;
          label?: string;
        },
      ) => {
        commands.push({
          command,
          args,
          cwd: options?.cwd ?? "",
          label: options?.label,
        });
      },
    );

    await expect(
      bootstrapRepo(repoRoot, {
        runCommandImpl,
        pathExists: (targetPath) => targetPath === repoSetupScript,
      }),
    ).resolves.toBeUndefined();

    expect(commands).toEqual([
      {
        command: "node",
        args: ["scripts/init-submodules.mjs"],
        cwd: repoRoot,
        label: "node scripts/init-submodules.mjs",
      },
      {
        command: "bun",
        args: ["install", "--ignore-scripts"],
        cwd: repoRoot,
        label: "bun install --ignore-scripts (repo bootstrap)",
      },
      {
        command: "node",
        args: ["eliza/packages/app-core/scripts/run-repo-setup.mjs"],
        cwd: repoRoot,
        label: "node eliza/packages/app-core/scripts/run-repo-setup.mjs",
      },
    ]);
  });

  it("fails clearly when the repo setup entrypoint is still missing", async () => {
    const runCommandImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      bootstrapRepo("/repo", {
        runCommandImpl,
        pathExists: () => false,
      }),
    ).rejects.toThrow(
      "Expected repo setup entrypoint at eliza/packages/app-core/scripts/run-repo-setup.mjs",
    );
  });
});
