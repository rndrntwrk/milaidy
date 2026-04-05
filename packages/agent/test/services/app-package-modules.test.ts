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

  afterEach(() => {
    vi.clearAllMocks();
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
});
