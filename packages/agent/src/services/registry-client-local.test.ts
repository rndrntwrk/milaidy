import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPluginInfo } from "./registry-client-types.js";

/**
 * registry-client-local tests using real filesystem temp directories.
 *
 * Uses a real temp workspace with actual package.json files on disk.
 * Only resolveStateDir is mocked to point at the temp location.
 */

const debugMock = vi.fn();
const resolveStateDirMock = vi.fn();

vi.mock("@elizaos/core", () => ({
  logger: {
    debug: debugMock,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir: resolveStateDirMock,
}));

let tmpRoot: string;
let workspaceRoot: string;
let stateDir: string;

describe("registry-client-local", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create a real temp directory structure
    tmpRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "milady-reg-local-test-"));
    workspaceRoot = path.join(tmpRoot, "workspace");
    stateDir = path.join(tmpRoot, "state");

    fsSync.mkdirSync(workspaceRoot, { recursive: true });
    fsSync.mkdirSync(stateDir, { recursive: true });

    process.env.ELIZA_WORKSPACE_ROOT = workspaceRoot;
    resolveStateDirMock.mockReturnValue(stateDir);
  });

  afterEach(() => {
    try {
      fsSync.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    delete process.env.ELIZA_WORKSPACE_ROOT;
  });

  it("discovers local apps from a real plugins/ directory", async () => {
    const pluginsDir = path.join(workspaceRoot, "plugins");
    const appDir = path.join(pluginsDir, "app-demo");

    // Create a real package.json on disk
    fsSync.mkdirSync(appDir, { recursive: true });
    fsSync.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({
        name: "@elizaos/app-demo",
        version: "1.0.0",
        elizaos: { kind: "app" },
      }),
      "utf-8",
    );

    const { applyLocalWorkspaceApps } = await import(
      "./registry-client-local.js"
    );
    const plugins = new Map<string, RegistryPluginInfo>();

    await applyLocalWorkspaceApps(plugins);

    expect(plugins.get("@elizaos/app-demo")?.localPath).toBe(appDir);
    // Should not log debug for missing optional dirs (ENOENT)
    expect(debugMock).not.toHaveBeenCalled();
  });

  it("still logs unexpected filesystem failures during workspace scans", async () => {
    const pluginsDir = path.join(workspaceRoot, "plugins");

    // Create a plugins directory but make it unreadable
    fsSync.mkdirSync(pluginsDir, { recursive: true });
    fsSync.chmodSync(pluginsDir, 0o000);

    const { applyLocalWorkspaceApps } = await import(
      "./registry-client-local.js"
    );

    try {
      await applyLocalWorkspaceApps(new Map());
    } finally {
      // Restore permissions for cleanup
      fsSync.chmodSync(pluginsDir, 0o755);
    }

    expect(debugMock).toHaveBeenCalled();
    expect(
      debugMock.mock.calls.some(([message]) =>
        String(message).includes(`could not read workspace dir ${pluginsDir}`),
      ),
    ).toBe(true);
  });
});
