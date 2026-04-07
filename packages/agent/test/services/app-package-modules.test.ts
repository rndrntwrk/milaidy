import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const registryClientMocks = vi.hoisted(() => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../../src/services/registry-client.js", () => registryClientMocks);

import {
  importAppPlugin,
  importAppRouteModule,
} from "../../src/services/app-package-modules";

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("app-package-modules", () => {
  const tempDirs: string[] = [];
  let previousCwd = process.cwd();

  afterEach(() => {
    vi.clearAllMocks();
    process.chdir(previousCwd);
    previousCwd = process.cwd();
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back to the built app plugin when the local source entry cannot load", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-plugin-load-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "src", "index.ts"),
      'throw new Error("source entry should be skipped");\n',
    );
    writeFile(
      path.join(tempDir, "dist", "index.js"),
      [
        "class HyperscapeService {}",
        'HyperscapeService.serviceType = "hyperscapeService";',
        "export default {",
        '  name: "@elizaos/app-test-fallback",',
        "  services: [HyperscapeService],",
        "};",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      localPath: tempDir,
    });

    const plugin = await importAppPlugin("@elizaos/app-test-fallback");

    expect(plugin?.name).toBe("@elizaos/app-test-fallback");
    expect(plugin?.services?.[0]?.serviceType).toBe("hyperscapeService");
  });

  it("falls back to the built route module when the local source route cannot load", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-route-load-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "src", "routes.ts"),
      'throw new Error("source routes should be skipped");\n',
    );
    writeFile(
      path.join(tempDir, "dist", "routes.js"),
      [
        "export async function handleAppRoutes() {",
        "  return true;",
        "}",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      localPath: tempDir,
    });

    const routeModule = await importAppRouteModule("test-fallback");

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(true);
  });

  it("resolves registry-backed bare slugs to plugin app route modules", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-app-route-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "dist", "routes.js"),
      [
        "export async function handleAppRoutes() {",
        "  return true;",
        "}",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      name: "@elizaos/plugin-test-route-app",
      kind: "app",
      localPath: tempDir,
    });

    const routeModule = await importAppRouteModule("test-route-app");

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(true);
  });

  it("prefers workspace-local app packages before consulting the registry", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-local-first-"));
    tempDirs.push(tempDir);

    const workspaceRoot = path.join(tempDir, "workspace");
    const repoRoot = path.join(workspaceRoot, "milady");
    fs.mkdirSync(repoRoot, { recursive: true });
    process.chdir(repoRoot);
    previousCwd = repoRoot;

    const localAppDir = path.join(workspaceRoot, "plugins", "app-hyperscape");
    writeFile(
      path.join(localAppDir, "package.json"),
      JSON.stringify(
        {
          name: "@elizaos/app-hyperscape",
          type: "module",
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(localAppDir, "dist", "routes.js"),
      [
        "export async function handleAppRoutes() {",
        "  return true;",
        "}",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockRejectedValue(
      new Error("registry should not be consulted"),
    );

    const routeModule = await importAppRouteModule("@elizaos/app-hyperscape");

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(true);
    expect(registryClientMocks.getPluginInfo).not.toHaveBeenCalled();
  });
});
