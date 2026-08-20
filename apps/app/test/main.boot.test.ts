import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALICE_CAMERA_DISTANCE_SCALE,
  ALICE_EDGE_VRM_URL,
  buildAppVrmAssets,
} from "../src/character-catalog";
import * as characterCatalog from "../src/character-catalog";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_CORE_SRC_DIR = path.resolve(
  TEST_DIR,
  "../../../packages/app-core/src",
);
const AGENT_SRC_DIR = path.resolve(TEST_DIR, "../../../packages/agent/src");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(TEST_DIR, relativePath), "utf-8");
}

function collectNamedImports(source: string, moduleId: string): string[] {
  const names = new Set<string>();
  const escaped = moduleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${escaped}["']`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    for (const raw of match[1].split(",")) {
      const name = raw
        .replace(/\btype\s+/g, "")
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function resolveSourcePath(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  const found = candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!found) {
    throw new Error(`Could not resolve ${specifier} from ${fromFile}`);
  }
  return found;
}

function collectExports(
  entryFile: string,
  visited = new Set<string>(),
): Set<string> {
  const absoluteEntry = path.resolve(entryFile);
  if (visited.has(absoluteEntry)) return new Set();
  visited.add(absoluteEntry);

  const source = fs.readFileSync(absoluteEntry, "utf-8");
  const exports = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    exports.add(match[1]);
  }
  for (const match of source.matchAll(
    /export\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g,
  )) {
    const sourceFile = resolveSourcePath(absoluteEntry, match[2]);
    if (
      match[1].includes("type ") &&
      !match[1].replace(/\btype\s+/g, "").trim()
    ) {
      continue;
    }
    for (const raw of match[1].split(",")) {
      const name = raw
        .replace(/\btype\s+/g, "")
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) exports.add(name);
    }
    for (const name of collectExports(sourceFile, visited)) {
      exports.add(name);
    }
  }
  for (const match of source.matchAll(
    /export\s+\*\s+from\s+["']([^"']+)["']/g,
  )) {
    const sourceFile = resolveSourcePath(absoluteEntry, match[1]);
    for (const name of collectExports(sourceFile, visited)) {
      exports.add(name);
    }
  }
  return exports;
}

describe("renderer boot guard", () => {
  it("boots the product avatar roster with Alice at milady-9", () => {
    const assets = (
      characterCatalog as typeof characterCatalog & {
        APP_VRM_ASSETS?: ReturnType<typeof buildAppVrmAssets>;
      }
    ).APP_VRM_ASSETS;

    expect(assets).toHaveLength(9);
    expect(assets?.at(-1)).toMatchObject({
      title: "Alice",
      slug: "milady-9",
      cameraDistanceScale: ALICE_CAMERA_DISTANCE_SCALE,
      vrmUrl: ALICE_EDGE_VRM_URL,
    });
  });

  it("keeps duplicate style presets from shifting bundled VRM indices", () => {
    const assets = buildAppVrmAssets([
      { name: "First", avatarIndex: 1 },
      { name: "Duplicate First", avatarIndex: 1 },
      { name: "Second", avatarIndex: 2 },
      { name: "Alice", avatarIndex: 9 },
    ] as unknown as Parameters<typeof buildAppVrmAssets>[0]);

    expect(assets.map((asset) => asset.slug)).toEqual([
      "milady-1",
      "milady-2",
      "milady-9",
    ]);
    expect(assets.at(-1)).toMatchObject({
      title: "Alice",
      slug: "milady-9",
      cameraDistanceScale: ALICE_CAMERA_DISTANCE_SCALE,
      vrmUrl: ALICE_EDGE_VRM_URL,
    });
    expect(buildAppVrmAssets()[8]).toMatchObject({
      slug: "milady-9",
      cameraDistanceScale: ALICE_CAMERA_DISTANCE_SCALE,
      vrmUrl: ALICE_EDGE_VRM_URL,
    });
  });

  it("keeps React root and platform boot initialization idempotent", () => {
    const source = readSource("../src/main.tsx");

    expect(source).toContain("__MILADY_REACT_ROOT__?: Root");
    expect(source).toContain("__MILADY_APP_BOOT_PROMISE__?: Promise<void>");
    expect(source).toContain(
      "window.__MILADY_REACT_ROOT__ ?? createRoot(rootEl)",
    );
    expect(source).toContain("if (window.__MILADY_APP_BOOT_PROMISE__)");
  });

  it("defers the eager Agent status probe while browser auth is required", () => {
    const source = readSource("../src/main.tsx");

    expect(source).toContain("const auth = await client.getAuthStatus()");
    expect(source).toContain(
      "if (auth?.required && !auth.localAccess && !auth.authenticated)",
    );
    expect(source.indexOf("client.getAuthStatus")).toBeLessThan(
      source.indexOf("Agent.getStatus()"),
    );
  });

  it("keeps the milaidy App and provider on the same React context", () => {
    const source = readSource("../src/main.tsx");

    expect(source).toContain('import { App } from "@miladyai/app-core/App"');
    expect(source).toMatch(
      /AppProvider[\s\S]*useApp[\s\S]*from "@miladyai\/app-core\/state"/,
    );
    expect(source).not.toMatch(
      /import\s*{[^}]*\bAppProvider\b[^}]*}\s*from "@elizaos\/app-core"/,
    );
    expect(source).not.toMatch(
      /import\s*{[^}]*\buseApp\b[^}]*}\s*from "@elizaos\/app-core"/,
    );
    expect(source).toContain(
      'import { AppWindowRenderer } from "@elizaos/ui/components/apps/AppWindowRenderer"',
    );
  });

  it("keeps upstream mobile runtime helpers on the UI first-run subpaths", () => {
    const source = readSource("../src/main.tsx");

    expect(source).toMatch(
      /MOBILE_RUNTIME_MODE_STORAGE_KEY[\s\S]*normalizeMobileRuntimeMode[\s\S]*from "@elizaos\/ui\/first-run\/mobile-runtime-mode"/,
    );
    expect(source).toContain(
      'import { preSeedAndroidLocalRuntimeIfFresh } from "@elizaos/ui/first-run/pre-seed-local-runtime"',
    );
    expect(source).not.toMatch(
      /MOBILE_RUNTIME_MODE_STORAGE_KEY[\s\S]*from "@miladyai\/app-core\/config"/,
    );
    expect(source).not.toMatch(
      /preSeedAndroidLocalRuntimeIfFresh[\s\S]*from "@miladyai\/app-core\/config"/,
    );
  });

  it("uses the current official Eliza theme export", () => {
    const source = readSource("../src/main.tsx");

    expect(source).toContain(
      'import { ELIZA_DEFAULT_THEME } from "@elizaos/ui/themes"',
    );
    expect(source).toContain("theme: ELIZA_DEFAULT_THEME");
    expect(source).not.toContain("MILADY_DEFAULT_THEME");
  });

  it("exports the direct launch connection helper from the milaidy platform barrel", () => {
    const platformDir = path.join(APP_CORE_SRC_DIR, "platform");
    const browserLaunch = fs.readFileSync(
      path.join(platformDir, "browser-launch.ts"),
      "utf-8",
    );
    const platformIndex = fs.readFileSync(
      path.join(platformDir, "index.ts"),
      "utf-8",
    );

    expect(browserLaunch).toContain("export function applyLaunchConnection");
    expect(platformIndex).toMatch(
      /applyLaunchConnection[\s\S]*applyLaunchConnectionFromUrl[\s\S]*from "\.\/browser-launch"/,
    );
  });

  it("keeps app-window navigation helpers available through the milaidy platform barrel", () => {
    const navigation = fs.readFileSync(
      path.join(APP_CORE_SRC_DIR, "navigation/index.ts"),
      "utf-8",
    );
    const platformIndex = fs.readFileSync(
      path.join(APP_CORE_SRC_DIR, "platform/index.ts"),
      "utf-8",
    );

    expect(navigation).toContain("export function isAppWindowRoute");
    expect(navigation).toContain("export function getWindowNavigationPath");
    expect(platformIndex).toMatch(
      /getWindowNavigationPath[\s\S]*isAppWindowRoute[\s\S]*from "\.\.\/navigation"/,
    );
  });

  it("keeps mobile runtime mode change events exported from milaidy app-core events", () => {
    const events = fs.readFileSync(
      path.join(APP_CORE_SRC_DIR, "events/index.ts"),
      "utf-8",
    );

    expect(events).toContain("export const MOBILE_RUNTIME_MODE_CHANGED_EVENT");
    expect(events).toMatch(
      /ElizaDocumentEventName[\s\S]*typeof MOBILE_RUNTIME_MODE_CHANGED_EVENT/,
    );
  });

  it("keeps LifeOps activity signals on the milaidy app context", () => {
    const source = readSource("../src/main.tsx");
    const wrapper = readSource(
      "../src/lifeops/LifeOpsActivitySignalsEffect.tsx",
    );

    expect(source).toContain('from "./lifeops/LifeOpsActivitySignalsEffect"');
    expect(source).not.toContain(
      'from "@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect"',
    );
    expect(wrapper).toContain('useApp } from "@miladyai/app-core/state"');
    expect(wrapper).not.toContain('useApp } from "@elizaos/ui"');
  });

  it("keeps cloud-hosted websocket upgrades available for post-open auth", () => {
    const serverSecurity = fs.readFileSync(
      path.join(APP_CORE_SRC_DIR, "api/server-security.ts"),
      "utf-8",
    );

    expect(serverSecurity).toContain("shouldAllowPostOpenWebSocketAuth");
    expect(serverSecurity).toContain("hasConfiguredPostOpenWebSocketToken");
    expect(serverSecurity).toMatch(
      /result\?\.status === 401[\s\S]*shouldAllowPostOpenWebSocketAuth/,
    );
  });

  it("keeps agent websocket upgrades available for post-open auth in cloud", () => {
    const agentSources = [
      fs.readFileSync(path.join(AGENT_SRC_DIR, "api/server-auth.ts"), "utf-8"),
      fs.readFileSync(path.join(AGENT_SRC_DIR, "api/server.ts"), "utf-8"),
    ];

    for (const source of agentSources) {
      expect(source).toContain(
        "if (handshakeToken && !tokenMatches(expected, handshakeToken))",
      );
      expect(source).not.toMatch(
        /!handshakeToken && isCloudProvisionedContainer\(\)[\s\S]{0,120}Unauthorized/,
      );
    }
  });

  it("keeps main.tsx milaidy app-core named imports backed by source exports", () => {
    const source = readSource("../src/main.tsx");
    const moduleEntries: Record<string, string> = {
      "@miladyai/app-core/config": "config/index.ts",
      "@miladyai/app-core/events": "events/index.ts",
      "@miladyai/app-core/platform": "platform/index.ts",
      "@miladyai/app-core/shell": "shell/index.ts",
      "@miladyai/app-core/state": "state/index.ts",
    };

    for (const [moduleId, entry] of Object.entries(moduleEntries)) {
      const imported = collectNamedImports(source, moduleId);
      if (imported.length === 0) continue;
      const exported = collectExports(path.join(APP_CORE_SRC_DIR, entry));
      const missing = imported.filter((name) => !exported.has(name));
      expect(missing, `${moduleId} missing exports`).toEqual([]);
    }
  });
});
