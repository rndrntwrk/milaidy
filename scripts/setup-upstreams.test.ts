import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMiladyCopyPatches,
  applyPluginAnthropicBunRuntimePatch,
  applyPluginAnthropicCliUsagePatch,
  bootstrapBundledBunInstall,
  findInstalledPackageDir,
  getElizaInstallArgs,
  getTemporaryElizaWorkspaceEntries,
} from "./setup-upstreams.mjs";

const tempDirs: string[] = [];
const LEGACY_COPY =
  "Sent through the connected {{source}} account on this Mac.";
const DEVICE_COPY =
  "Sent through the connected {{source}} account on this device.";

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-setup-upstreams-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("getElizaInstallArgs", () => {
  it("uses a normal bun install by default", () => {
    expect(getElizaInstallArgs({})).toEqual(["install"]);
  });

  it("skips lifecycle scripts when vision deps are disabled", () => {
    expect(getElizaInstallArgs({ MILADY_NO_VISION_DEPS: "1" })).toEqual([
      "install",
      "--ignore-scripts",
    ]);
  });
});

describe("getTemporaryElizaWorkspaceEntries", () => {
  it("includes the root CI stub workspace for unpublished eliza plugins", () => {
    const elizaRoot = "/repo/eliza";
    const existingPaths = new Set([
      path.join(
        elizaRoot,
        "plugins",
        "plugin-sql",
        "typescript",
        "package.json",
      ),
      path.join(
        elizaRoot,
        "..",
        "scripts",
        "ci-stubs",
        "elizaos-plugin-wechat",
        "package.json",
      ),
    ]);

    expect(
      getTemporaryElizaWorkspaceEntries(elizaRoot, {
        pathExists: (targetPath) => existingPaths.has(targetPath),
      }),
    ).toEqual([
      "plugins/plugin-sql/typescript",
      "../scripts/ci-stubs/elizaos-plugin-wechat",
    ]);
  });
});

describe("findInstalledPackageDir", () => {
  it("falls back to eliza workspace installs for nested plugin dependencies", () => {
    const repoRoot = makeTempDir();
    const elizaRoot = path.join(repoRoot, "eliza");
    const elizaInstall = path.join(
      elizaRoot,
      "node_modules",
      "@types",
      "bun",
      "package.json",
    );

    writeFile(elizaInstall, '{"name":"@types/bun"}');

    expect(findInstalledPackageDir(repoRoot, "@types/bun")).toBeNull();
    expect(
      findInstalledPackageDir(repoRoot, "@types/bun", undefined, null, {
        searchRoots: [repoRoot, elizaRoot],
      }),
    ).toBe(path.dirname(elizaInstall));
  });
});

describe("bootstrapBundledBunInstall", () => {
  it("does nothing when lifecycle scripts were not skipped", async () => {
    const runCommandImpl = vi.fn();

    await expect(
      bootstrapBundledBunInstall("/repo/eliza", {
        env: {},
        pathExists: () => true,
        runCommandImpl,
      }),
    ).resolves.toBe(false);

    expect(runCommandImpl).not.toHaveBeenCalled();
  });

  it("runs Bun's bundled install script after ignore-scripts installs", async () => {
    const runCommandImpl = vi.fn().mockResolvedValue(undefined);
    const workspaceRoot = "/repo/eliza";
    const bunInstallScriptPath = path.join(
      workspaceRoot,
      "node_modules",
      "bun",
      "install.js",
    );

    await expect(
      bootstrapBundledBunInstall(workspaceRoot, {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: (targetPath) => targetPath === bunInstallScriptPath,
        runCommandImpl,
      }),
    ).resolves.toBe(true);

    expect(runCommandImpl).toHaveBeenCalledWith(
      "node",
      [path.join("node_modules", "bun", "install.js")],
      {
        cwd: workspaceRoot,
        label: "node node_modules/bun/install.js (eliza bun bootstrap)",
      },
    );
  });

  it("fails clearly when Bun's bundled install script is missing", async () => {
    await expect(
      bootstrapBundledBunInstall("/repo/eliza", {
        env: { MILADY_NO_VISION_DEPS: "1" },
        pathExists: () => false,
        runCommandImpl: vi.fn(),
      }),
    ).rejects.toThrow("node_modules/bun/install.js");
  });
});

describe("applyMiladyCopyPatches", () => {
  it("rewrites legacy inbox hint copy across target files", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );

    writeFile(chatViewPath, `copy: "${LEGACY_COPY}"`);
    writeFile(localePath, `{"reply_hint":"${LEGACY_COPY}"}`);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(2);
    expect(fs.readFileSync(chatViewPath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(chatViewPath, "utf8")).not.toContain(LEGACY_COPY);
    expect(fs.readFileSync(localePath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(localePath, "utf8")).not.toContain(LEGACY_COPY);
  });

  it("is idempotent after replacement", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(chatViewPath, DEVICE_COPY);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(fs.readFileSync(chatViewPath, "utf8")).toBe(DEVICE_COPY);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("warns when target files exist but patch targets no longer match", () => {
    const elizaRoot = makeTempDir();
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(localePath, '{"reply_hint":"unexpected copy"}');

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[setup-upstreams] WARNING: inbox reply hint legacy string not found — patch may need updating",
    );

    warnSpy.mockRestore();
  });
});

describe("applyPluginAnthropicCliUsagePatch", () => {
  it("normalizes Claude CLI usage fields to prompt/completion tokens", () => {
    const elizaRoot = makeTempDir();
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      claudeCliPath,
      [
        "const usage = {",
        "    inputTokens: number;",
        "    outputTokens: number;",
        "};",
        "const mapped = {",
        "    inputTokens: entry.inputTokens,",
        "    outputTokens: entry.outputTokens,",
        "};",
        "emitModelUsageEvent(runtime, modelType, prompt, {",
        "      promptTokens: usage.inputTokens,",
        "      completionTokens: usage.outputTokens,",
        "});",
        "emitModelUsageEvent(runtime, modelType, prompt, {",
        "                promptTokens: usage.inputTokens,",
        "                completionTokens: usage.outputTokens,",
        "});",
      ].join("\n"),
    );

    expect(applyPluginAnthropicCliUsagePatch(elizaRoot)).toBe(4);
    const patched = fs.readFileSync(claudeCliPath, "utf8");
    expect(patched).toContain("promptTokens: number;");
    expect(patched).toContain("completionTokens: number;");
    expect(patched).toContain("promptTokens: entry.inputTokens,");
    expect(patched).toContain("completionTokens: entry.outputTokens,");
    expect(patched).toContain("promptTokens: usage.promptTokens,");
    expect(patched).toContain("completionTokens: usage.completionTokens,");
    expect(patched).not.toContain("usage.inputTokens");
    expect(patched).not.toContain("usage.outputTokens");
  });
});

describe("applyPluginAnthropicBunRuntimePatch", () => {
  it("rewrites plugin-anthropic Bun globals to a typed globalThis fallback", () => {
    const elizaRoot = makeTempDir();
    const initPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "init.ts",
    );
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      initPath,
      [
        'if (authMode === "cli") {',
        "  try {",
        '        const result = Bun.spawnSync(["claude", "--version"], {',
        '          stdout: "pipe",',
        '          stderr: "pipe",',
        "        });",
        '        if (result.exitCode !== 0) throw new Error("claude not found");',
        "  } catch {}",
        "}",
      ].join("\n"),
    );
    writeFile(
      claudeCliPath,
      [
        "function parseUsage(",
        "  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,",
        '): CliGenerateResult["usage"] {',
        "  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;",
        "  if (!entry) return null;",
        "  return {",
        "    promptTokens: entry.inputTokens,",
        "    completionTokens: entry.outputTokens,",
        "    totalTokens: entry.inputTokens + entry.outputTokens,",
        "  };",
        "}",
        "",
        "/**",
        " * Run a prompt through `claude -p` (non-streaming).",
        " */",
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
      ].join("\n"),
    );

    expect(applyPluginAnthropicBunRuntimePatch(elizaRoot)).toBe(4);
    const patchedInit = fs.readFileSync(initPath, "utf8");
    const patchedCli = fs.readFileSync(claudeCliPath, "utf8");

    expect(patchedInit).toContain(
      "const bunRuntime = (globalThis as typeof globalThis",
    );
    expect(patchedInit).toContain("if (!result || result.exitCode !== 0)");
    expect(patchedCli).toContain("function getBunRuntime()");
    expect(patchedCli).toContain("const proc = getBunRuntime().spawn");
    expect(patchedCli).not.toContain("Bun.spawn(");
  });

  it("patches the original upstream Claude CLI source before the usage rewrite runs", () => {
    const elizaRoot = makeTempDir();
    const claudeCliPath = path.join(
      elizaRoot,
      "plugins",
      "plugin-anthropic",
      "typescript",
      "utils",
      "claude-cli.ts",
    );

    writeFile(
      claudeCliPath,
      [
        "function parseUsage(",
        "  modelUsage: Record<string, ClaudeCliModelUsage> | undefined,",
        '): CliGenerateResult["usage"] {',
        "  const entry = modelUsage ? Object.values(modelUsage)[0] : undefined;",
        "  if (!entry) return null;",
        "  return {",
        "    inputTokens: entry.inputTokens,",
        "    outputTokens: entry.outputTokens,",
        "    totalTokens: entry.inputTokens + entry.outputTokens,",
        "  };",
        "}",
        "",
        "/**",
        " * Run a prompt through `claude -p` (non-streaming).",
        " */",
        'const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });',
      ].join("\n"),
    );

    expect(applyPluginAnthropicBunRuntimePatch(elizaRoot)).toBe(2);
    expect(applyPluginAnthropicCliUsagePatch(elizaRoot)).toBe(0);

    const patchedCli = fs.readFileSync(claudeCliPath, "utf8");
    expect(patchedCli).toContain("function getBunRuntime()");
    expect(patchedCli).toContain("promptTokens: entry.inputTokens");
    expect(patchedCli).toContain("completionTokens: entry.outputTokens");
    expect(patchedCli).toContain("const proc = getBunRuntime().spawn");
    expect(patchedCli).not.toContain("inputTokens: entry.inputTokens,");
    expect(patchedCli).not.toContain("outputTokens: entry.outputTokens,");
  });
});
