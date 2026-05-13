import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAllowedHostEnv,
  toViteAllowedHosts,
} from "@elizaos/app-core/config/allowed-hosts";
import { colorizeDevSettingsStartupBanner } from "@elizaos/shared/dev-settings-banner-style";
import { prependDevSubsystemFigletHeading } from "@elizaos/shared/dev-settings-figlet-heading";
import {
  type DevSettingsRow,
  formatDevSettingsTable,
} from "@elizaos/shared/dev-settings-table";
import {
  resolveDesktopApiPort,
  resolveDesktopApiPortPreference,
  resolveDesktopUiPort,
  resolveDesktopUiPortPreference,
} from "@elizaos/shared/runtime-env";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { colorizeDevSettingsStartupBanner } from "../../packages/shared/src/dev-settings-banner-style.ts";
import { prependDevSubsystemFigletHeading } from "../../packages/shared/src/dev-settings-figlet-heading.ts";
import {
  type DevSettingsRow,
  formatDevSettingsTable,
} from "../../packages/shared/src/dev-settings-table.ts";
import {
  resolveDesktopApiPort,
  resolveDesktopApiPortPreference,
  resolveDesktopUiPort,
  resolveDesktopUiPortPreference,
} from "../../packages/shared/src/runtime-env.ts";

const _require = createRequire(import.meta.url);

// Keep workspace-relative TS imports in this config so Vite transpiles them
// while bundling the config instead of asking Node to load package-exported
// .ts files directly in CI.
const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const pluginSqlSrcRoot = path.join(
  miladyRoot,
  "eliza/plugins/plugin-sql/typescript",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWorkspaceExportAliases(
  packageName: string,
  packageJsonPath: string,
): Array<{ find: RegExp; replacement: string }> {
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    exports?: Record<string, string | Record<string, unknown>>;
  };

  const aliases: Array<{ find: RegExp; replacement: string }> = [];

  for (const [key, value] of Object.entries(packageJson.exports || {})) {
    const exportTarget =
      typeof value === "string"
        ? value
        : typeof value.import === "string"
          ? value.import
          : typeof value.default === "string"
            ? value.default
            : null;
    if (!exportTarget) continue;

    const aliasKey =
      key === "." ? packageName : `${packageName}/${key.replace(/^\.\//, "")}`;
    const wildcardCount = (aliasKey.match(/\*/g) || []).length;
    const replacement = path.resolve(packageDir, exportTarget);

    if (wildcardCount > 0) {
      let captureIndex = 0;
      const aliasPattern = escapeRegExp(aliasKey).replace(
        /\\\*/g,
        () => `(.+)`,
      );
      const wildcardReplacement = replacement.replace(
        /\*/g,
        () => `$${++captureIndex}`,
      );

      aliases.push({
        find: new RegExp(`^${aliasPattern}$`),
        replacement: wildcardReplacement,
      });

      if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
        aliases.push({
          find: new RegExp(`^${aliasPattern}\\.js$`),
          replacement: wildcardReplacement,
        });
      }

      continue;
    }

    aliases.push({
      find: new RegExp(`^${escapeRegExp(aliasKey)}$`),
      replacement,
    });

    if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
      aliases.push({
        find: new RegExp(`^${escapeRegExp(aliasKey)}\\.js$`),
        replacement,
      });
    }
  }

  return aliases;
}

// Walk eliza/packages/native-plugins/ and produce Vite aliases for every
// `@elizaos/capacitor-<name>` package found. Each maps to that package's
// `src/index.ts` directly, bypassing the package's `main` field (which
// points at `./dist/plugin.cjs.js`, a file that is NOT built before the
// SPA vite step). main.tsx imports like `@elizaos/capacitor-agent` and
// `@elizaos/capacitor-desktop` resolve via these aliases.
//
// Adapted from upstream milady-ai/milady's apps/app/vite.config.ts:
//   - the `Alias` type isn't imported in alice's config (it's just an
//     anonymous shape), so we keep the same `{ find: RegExp; replacement
//     : string }` literal used by `buildWorkspaceExportAliases`.
//   - returns an empty array when the directory doesn't exist (the
//     submodule may be uninitialised on a fresh clone before
//     `bun run eliza:local`).
function resolveNativePluginAliasEntries(): Array<{
  find: RegExp;
  replacement: string;
}> {
  const nativePluginsRoot = path.join(
    miladyRoot,
    "eliza/packages/native-plugins",
  );
  if (!fs.existsSync(nativePluginsRoot)) return [];

  return fs
    .readdirSync(nativePluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        fs.existsSync(path.join(nativePluginsRoot, name, "package.json")) &&
        fs.existsSync(path.join(nativePluginsRoot, name, "src/index.ts")),
    )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      find: new RegExp(`^@elizaos/capacitor-${escapeRegExp(name)}$`),
      replacement: path.join(nativePluginsRoot, `${name}/src/index.ts`),
    }));
}

// Probe for a TS/TSX source file matching <dir>/<basename>.{ts,tsx,js,jsx}.
function probeSourceFile(dir: string, basename: string): string | null {
  for (const ext of ["ts", "tsx", "js", "jsx"]) {
    const p = path.join(dir, `${basename}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Build vite aliases for an unbuilt eliza app-* workspace package by walking
// its `src/` tree directly. Most `eliza/plugins/app-*` packages are NOT in
// the Dockerfile prebuild list, so their `dist/` directory never exists at
// vite-build time — exports-field aliases would point at non-existent
// `dist/<subpath>.js` files and rollup would fail with `ENOENT`. Pointing
// at src means vite/rollup-plugin-commonjs can read the TS source directly.
//
// For each app-* package: emit aliases for the bare import (`@elizaos/app-X`
// → `src/index.{ts,tsx}`) plus every subdirectory with an `index.{ts,tsx}`
// (→ that index) and every top-level non-index file (→ that file). Recurses
// to a max depth of 3 so deep imports like
// `@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect` resolve
// correctly.
function buildElizaAppSourceAliases(
  pkgName: string,
  packageDir: string,
): Array<{ find: RegExp; replacement: string }> {
  const srcDir = path.join(packageDir, "src");
  if (!fs.existsSync(srcDir)) return [];
  const aliases: Array<{ find: RegExp; replacement: string }> = [];

  const rootIndex = probeSourceFile(srcDir, "index");
  if (rootIndex) {
    aliases.push({
      find: new RegExp(`^${escapeRegExp(pkgName)}$`),
      replacement: rootIndex,
    });
  }

  function walk(currentDir: string, relativeKey: string, depth: number): void {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const entryPath = path.join(currentDir, entry.name);
      const newKey = relativeKey
        ? `${relativeKey}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        const indexFile = probeSourceFile(entryPath, "index");
        if (indexFile) {
          aliases.push({
            find: new RegExp(
              `^${escapeRegExp(pkgName)}/${escapeRegExp(newKey)}$`,
            ),
            replacement: indexFile,
          });
        }
        walk(entryPath, newKey, depth + 1);
      } else if (entry.isFile()) {
        const m = entry.name.match(/^(.+)\.(tsx?|jsx?)$/);
        if (!m || m[1] === "index") continue;
        if (entry.name.endsWith(".d.ts")) continue;
        // Skip co-located test fixtures. Without this, files like
        // `src/lifeops/scheduled-task/scheduler.test.ts` produce aliases
        // (`^@elizaos/app-X/.../scheduler.test$`) that can pull vitest +
        // its dependencies into the SPA bundle if anything inadvertently
        // imports the path.
        if (entry.name.includes(".test.") || entry.name.includes(".spec."))
          continue;
        const basename = m[1];
        const fileKey = relativeKey ? `${relativeKey}/${basename}` : basename;
        aliases.push({
          find: new RegExp(
            `^${escapeRegExp(pkgName)}/${escapeRegExp(fileKey)}$`,
          ),
          replacement: entryPath,
        });
        aliases.push({
          find: new RegExp(
            `^${escapeRegExp(pkgName)}/${escapeRegExp(fileKey)}\\.js$`,
          ),
          replacement: entryPath,
        });
      }
    }
  }
  walk(srcDir, "", 0);

  return aliases;
}

// Walk eliza/plugins/ for every `app-*` subdir that has a `package.json`
// and emit src-rooted aliases via `buildElizaAppSourceAliases`. Covers the
// long list of subpath imports in apps/app/src/main.tsx
// (`@elizaos/app-companion/ui`, `/register`, `@elizaos/app-2004scape/ui`,
// `@elizaos/app-babylon/ui`, etc.) without enumerating them by hand.
//
// Note: this uses the package's `src/` tree, NOT its `exports` field. The
// exports field would point at `dist/` which is only built for the small
// subset of apps in the Dockerfile prebuild list (lifeops, wallet, phone,
// wifi, contacts). All other app-* packages have no dist at vite-build
// time. Reading src directly is what upstream milady-ai/milady does.
//
// Returns both the alias entries and the set of app names actually found
// — callers use the name set to build a stub-fallback alias for missing
// apps that main.tsx imports as side-effects (see `optional-eliza-app-stub`
// in apps/app/src/).
function resolveElizaAppAliasEntries(): {
  aliases: Array<{ find: RegExp; replacement: string }>;
  realAppNames: string[];
} {
  const elizaPluginsRoot = path.join(miladyRoot, "eliza/plugins");
  if (!fs.existsSync(elizaPluginsRoot)) {
    return { aliases: [], realAppNames: [] };
  }

  const aliases: Array<{ find: RegExp; replacement: string }> = [];
  const realAppNames: string[] = [];
  for (const entry of fs.readdirSync(elizaPluginsRoot, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("app-")) continue;
    const packageDir = path.join(elizaPluginsRoot, entry.name);
    const pkgJsonPath = path.join(packageDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
        name?: string;
      };
      if (!pkg.name) continue;
      aliases.push(...buildElizaAppSourceAliases(pkg.name, packageDir));
      // Strip `app-` from "app-companion" -> "companion" so the
      // stub-fallback regex can build a negative lookahead.
      realAppNames.push(entry.name.replace(/^app-/, ""));
    } catch {
      // Malformed package.json — skip silently. Build failure will surface
      // the missing alias via the standard "Rollup failed to resolve" path,
      // not here.
    }
  }
  return { aliases, realAppNames };
}

// Build a fallback alias that maps `@elizaos/app-<name>{,/subpath}` to
// `apps/app/src/optional-eliza-app-stub.tsx` for any app name NOT in
// `realAppNames`. main.tsx side-effect imports like
// `import "@elizaos/app-workflow-builder/register"` reference apps that
// may not exist in the current eliza checkout (e.g.
// `app-workflow-builder` is in upstream milady-ai's main.tsx but the
// package isn't present in our eliza submodule). The stub is a no-op
// component file that makes side-effect imports succeed.
//
// The regex shape mirrors upstream milady's `optionalElizaAppAliasPattern`
// at apps/app/vite.config.ts:148-153 of milady-ai/milady@develop.
function resolveOptionalElizaAppStubAlias(
  realAppNames: string[],
): { find: RegExp; replacement: string } | null {
  const stubEntry = path.join(here, "src/optional-eliza-app-stub.tsx");
  if (!fs.existsSync(stubEntry)) return null;
  // `core` is the only never-stubbed name (it's @elizaos/app-core, which
  // is handled by its own explicit alias above). All other present apps
  // come from realAppNames.
  const escapedNames = ["core", ...realAppNames]
    .map((n) => escapeRegExp(n))
    .join("|");
  return {
    find: new RegExp(`^@elizaos\\/app-(?!(${escapedNames})(\\/|$)).+$`),
    replacement: stubEntry,
  };
}

/**
 * Pinned @elizaos/core from the repo root (must match the agent/runtime lock).
 */
function getMiladyPinnedElizaCoreVersion(): string {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(miladyRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const spec =
      raw.dependencies?.["@elizaos/core"] ??
      raw.overrides?.["@elizaos/core"] ??
      "";
    const v = String(spec)
      .trim()
      .replace(/^[\^~]/, "");
    if (v && v !== "workspace:*" && /^\d/.test(v)) {
      const first = v.split(/\s+/)[0];
      if (first) return first;
    }
  } catch {
    /* fall through */
  }
  return "2.0.0-alpha.109";
}

/** Bun cache dir names look like `@elizaos+core@2.0.0-alpha.109+<hash>`. */
function elizaCoreAlphaPrerelease(dir: string): number {
  const m = dir.match(/@elizaos\+core@[\d.]+-alpha\.(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : -1;
}

/**
 * Bun stores a full npm tarball under node_modules/.bun even when the workspace
 * symlink for @elizaos/core points at an unbuilt local eliza checkout.
 *
 * **WHY sort:** `readdir` order is arbitrary; picking `alpha.12` over `alpha.109`
 * mismatches the API and tends to blank the Electrobun webview.
 */
function findElizaCoreBundleInBunStore(
  kind: "browser" | "node",
): string | null {
  const bunDir = path.join(miladyRoot, "node_modules/.bun");
  const rel =
    kind === "browser"
      ? "node_modules/@elizaos/core/dist/browser/index.browser.js"
      : "node_modules/@elizaos/core/dist/node/index.node.js";
  if (!fs.existsSync(bunDir)) return null;
  let entries: string[];
  try {
    entries = fs.readdirSync(bunDir);
  } catch {
    return null;
  }
  const pinned = getMiladyPinnedElizaCoreVersion();
  const pinnedPrefix = `@elizaos+core@${pinned}+`;

  const withDist = entries.filter((dir) => {
    if (!dir.startsWith("@elizaos+core@")) return false;
    return fs.existsSync(path.join(bunDir, dir, rel));
  });

  const pinnedMatch = withDist.find((d) => d.startsWith(pinnedPrefix));
  if (pinnedMatch) return path.join(bunDir, pinnedMatch, rel);

  if (withDist.length === 0) return null;

  withDist.sort(
    (a, b) => elizaCoreAlphaPrerelease(b) - elizaCoreAlphaPrerelease(a),
  );
  const best = withDist[0];
  return best ? path.join(bunDir, best, rel) : null;
}

/**
 * Resolved file path for bundling `@elizaos/core` in the renderer.
 * Linked eliza checkouts sometimes omit `dist/` until `bun run build`;
 * fall back to `dist/node` (Vite stubs `node:` imports via nativeModuleStubPlugin),
 * then to the bun install cache copy.
 */
function resolveElizaCoreBundlePath(): string {
  const pkgDir = path.dirname(_require.resolve("@elizaos/core/package.json"));
  const browserEntry = path.join(pkgDir, "dist/browser/index.browser.js");
  const nodeEntry = path.join(pkgDir, "dist/node/index.node.js");
  if (fs.existsSync(browserEntry)) return browserEntry;
  if (fs.existsSync(nodeEntry)) {
    console.warn(
      "[milady][vite] @elizaos/core dist/browser is missing; using dist/node for the client bundle. " +
        "For a linked eliza workspace, run `bun run build` in that checkout (e.g. packages/typescript). " +
        "Or reinstall with ELIZA_SKIP_LOCAL_ELIZA=1 to use the published npm package.",
    );
    return nodeEntry;
  }
  const bunBrowser = findElizaCoreBundleInBunStore("browser");
  if (bunBrowser) {
    console.warn(
      `[milady][vite] Linked @elizaos/core at ${pkgDir} has no dist/; using bun cache build at ${bunBrowser}. ` +
        "Run `bun run build` in your eliza checkout or ELIZA_SKIP_LOCAL_ELIZA=1 bun install to align versions.",
    );
    return bunBrowser;
  }
  const bunNode = findElizaCoreBundleInBunStore("node");
  if (bunNode) {
    console.warn(
      `[milady][vite] Linked @elizaos/core at ${pkgDir} has no dist/; using bun cache node bundle at ${bunNode}.`,
    );
    return bunNode;
  }
  throw new Error(
    `[milady][vite] @elizaos/core has no built artifacts under ${pkgDir} and none in node_modules/.bun. ` +
      "Expected dist/browser/index.browser.js or dist/node/index.node.js. " +
      "Build your local eliza workspace or run `ELIZA_SKIP_LOCAL_ELIZA=1 bun install`.",
  );
}

// The dev script sets MILADY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = resolveDesktopApiPort(process.env);
const uiPort = resolveDesktopUiPort(process.env);
const enableAppSourceMaps = process.env.MILADY_APP_SOURCEMAP === "1";
/** Set by scripts/dev-platform.mjs for `vite build --watch` (Electrobun desktop). */
const desktopFastDist = process.env.MILADY_DESKTOP_VITE_FAST_DIST === "1";

function pathIncludesAny(id: string, markers: string[]): boolean {
  return markers.some((marker) => id.includes(marker));
}

function resolveManualChunk(id: string): string | undefined {
  const normalizedId = id.split(path.sep).join("/");

  if (normalizedId.includes("/node_modules/")) {
    if (
      pathIncludesAny(normalizedId, [
        "/@react-spring/",
        "/react-dom/",
        "/react-is/",
        "/scheduler/",
        "/react/",
      ])
    ) {
      return "vendor-react";
    }

    if (normalizedId.includes("/@pixiv/three-vrm/")) {
      return "vendor-vrm";
    }

    if (normalizedId.includes("/three/examples/")) {
      return "vendor-three-extras";
    }

    if (pathIncludesAny(normalizedId, ["/three/build/", "/three/src/"])) {
      return "vendor-three";
    }
  }

  return undefined;
}

/**
 * Dev-only middleware that handles CORS for the desktop custom-scheme origin
 * (electrobun://-). Vite's proxy doesn't reliably forward CORS headers
 * for non-http origins, so we intercept preflight OPTIONS requests and tag
 * every /api response with the correct headers before the proxy layer.
 */
function envFlagEffective(name: string): "on" | "off" {
  return process.env[name] === "1" ? "on" : "off";
}

function envFlagSource(name: string, whenOn = "1"): string {
  const v = process.env[name]?.trim();
  if (v === whenOn || (whenOn === "1" && v === "true"))
    return `env set — ${name}=${v}`;
  return `default (unset — off)`;
}

function buildViteDevSettingsRows(
  mode: "dev-server" | "build-watch",
): DevSettingsRow[] {
  const apiPref = resolveDesktopApiPortPreference(process.env);
  const uiPref = resolveDesktopUiPortPreference(process.env);
  const apiPort = resolveDesktopApiPort(process.env);
  const uiPort = resolveDesktopUiPort(process.env);
  const assetBase =
    process.env.VITE_ASSET_BASE_URL?.trim() ||
    process.env.MILADY_ASSET_BASE_URL?.trim() ||
    "—";

  return [
    {
      setting: "MILADY_APP_SOURCEMAP",
      effective: envFlagEffective("MILADY_APP_SOURCEMAP"),
      source: envFlagSource("MILADY_APP_SOURCEMAP"),
      change: "export MILADY_APP_SOURCEMAP=1 to enable; unset for off",
    },
    {
      setting: "MILADY_DESKTOP_VITE_FAST_DIST",
      effective: envFlagEffective("MILADY_DESKTOP_VITE_FAST_DIST"),
      source: envFlagSource("MILADY_DESKTOP_VITE_FAST_DIST"),
      change:
        "set by dev orchestrator for Rollup watch; unset for normal dev server",
    },
    {
      setting: "MILADY_TTS_DEBUG",
      effective: process.env.MILADY_TTS_DEBUG?.trim() ? "set" : "—",
      source: process.env.MILADY_TTS_DEBUG?.trim()
        ? "env set — MILADY_TTS_DEBUG"
        : "default (unset)",
      change: "export MILADY_TTS_DEBUG=1 for TTS trace logs",
    },
    {
      setting: "MILADY_SETTINGS_DEBUG / VITE_MILADY_SETTINGS_DEBUG",
      effective:
        process.env.MILADY_SETTINGS_DEBUG?.trim() ||
        process.env.VITE_MILADY_SETTINGS_DEBUG?.trim()
          ? "set"
          : "—",
      source: process.env.VITE_MILADY_SETTINGS_DEBUG?.trim()
        ? "env set — VITE_MILADY_SETTINGS_DEBUG"
        : process.env.MILADY_SETTINGS_DEBUG?.trim()
          ? "env set — MILADY_SETTINGS_DEBUG"
          : "default (unset)",
      change: "export MILADY_SETTINGS_DEBUG=1 or VITE_MILADY_SETTINGS_DEBUG=1",
    },
    {
      setting: "VITE_ASSET_BASE_URL / MILADY_ASSET_BASE_URL",
      effective: assetBase,
      source: process.env.VITE_ASSET_BASE_URL?.trim()
        ? "env set — VITE_ASSET_BASE_URL"
        : process.env.MILADY_ASSET_BASE_URL?.trim()
          ? "env set — MILADY_ASSET_BASE_URL"
          : "default (unset — empty)",
      change: "export VITE_ASSET_BASE_URL=… or MILADY_ASSET_BASE_URL=…",
    },
    {
      setting: "MILADY_DEV_POLLING",
      effective: envFlagEffective("MILADY_DEV_POLLING"),
      source: envFlagSource("MILADY_DEV_POLLING"),
      change: "export MILADY_DEV_POLLING=1 for watch polling (VM/file shares)",
    },
    {
      setting: "API port (resolved)",
      effective: String(apiPort),
      source: apiPref.sourceLabel,
      change: `${apiPref.changeLabel}; proxy /api → http://127.0.0.1:${apiPort}`,
    },
    {
      setting: "UI port (resolved)",
      effective: String(uiPort),
      source: uiPref.sourceLabel,
      change: uiPref.changeLabel,
    },
    {
      setting: "Mode",
      effective:
        mode === "dev-server" ? "vite dev (HMR)" : "vite build --watch",
      source: "derived",
      change:
        mode === "dev-server"
          ? "bun run dev (default); MILADY_DESKTOP_VITE_BUILD_WATCH=1 for Rollup watch"
          : "MILADY_DESKTOP_VITE_WATCH=1 + MILADY_DESKTOP_VITE_BUILD_WATCH=1",
    },
  ];
}

/** Print effective env once per Vite process (dev server or first Rollup watch tick). */
function miladyDevSettingsBannerPlugin(): Plugin {
  let printedWatch = false;
  return {
    name: "milady-dev-settings-banner",
    configureServer() {
      return () => {
        console.log(
          colorizeDevSettingsStartupBanner(
            prependDevSubsystemFigletHeading(
              "vite",
              formatDevSettingsTable(
                "Vite — effective settings (dev server)",
                buildViteDevSettingsRows("dev-server"),
              ),
            ),
          ),
        );
      };
    },
    buildStart() {
      if (process.env.MILADY_DESKTOP_VITE_FAST_DIST === "1" && !printedWatch) {
        printedWatch = true;
        console.log(
          colorizeDevSettingsStartupBanner(
            prependDevSubsystemFigletHeading(
              "vite",
              formatDevSettingsTable(
                "Vite — effective settings (build --watch)",
                buildViteDevSettingsRows("build-watch"),
              ),
            ),
          ),
        );
      }
    },
  };
}

function desktopCorsPlugin(): Plugin {
  const accessControlAllowHeaders =
    "Content-Type, Authorization, X-API-Token, X-Api-Key, X-ElizaOS-Client-Id, X-ElizaOS-UI-Language, X-ElizaOS-Token, X-Eliza-Export-Token, X-Eliza-Terminal-Token, X-Milady-CSRF";

  return {
    name: "desktop-cors",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || !req.url?.startsWith("/api")) return next();

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          accessControlAllowHeaders,
        );

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

/**
 * Generate a virtual ESM module that stubs all exports of a Node built-in.
 * We `require()` the real module at Vite config time (Node process), read its
 * export names, and emit matching no-op stubs so esbuild's static import
 * analysis succeeds.  At runtime these stubs are never meaningfully called
 * because the server-only code paths that use them are never executed in the
 * browser.
 */
function generateNodeBuiltinStub(moduleId: string, req = _require): string {
  const bareModule = moduleId.replace(/^node:/, "");
  const lines = [
    // noop: returns itself (for chained calls like createRequire(url)(id)),
    // and is a valid class base (so `class X extends noop` works).
    "function noop() { return noop; }",
    "const asyncNoop = () => Promise.resolve();",
    "const handler = { get(t, p) { if (typeof p === 'symbol') return undefined; if (p === '__esModule') return true; if (p === 'default') return t; if (p === 'prototype') return {}; return noop; }, has() { return true; }, ownKeys() { return []; }, getOwnPropertyDescriptor() { return { configurable: true, enumerable: true }; } };",
    "const stub = new Proxy({}, handler);",
    "export default stub;",
  ];

  let exportNames: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real = req(bareModule);
    exportNames = Object.keys(real).filter(
      (k) => !k.startsWith("_") && k !== "default",
    );
  } catch {
    // Module not available (e.g. dns/promises on some platforms)
  }

  const reserved = new Set([
    "default",
    "arguments",
    "eval",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]);

  for (const name of exportNames) {
    if (reserved.has(name)) continue;
    // Validate it's a valid JS identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const real = req(bareModule);
      const val = real[name];
      if (typeof val === "function") {
        if (
          /^[A-Z]/.test(name) &&
          val.prototype &&
          Object.getOwnPropertyNames(val.prototype).length > 1
        ) {
          lines.push(`export class ${name} { constructor() {} }`);
        } else {
          lines.push(`export const ${name} = noop;`);
        }
      } else if (typeof val === "object" && val !== null) {
        // For objects like fs.constants, promises, etc. — wrap in Proxy
        lines.push(`export const ${name} = new Proxy({}, handler);`);
      } else if (typeof val === "string") {
        lines.push(`export const ${name} = ${JSON.stringify(val)};`);
      } else if (typeof val === "number" || typeof val === "boolean") {
        lines.push(`export const ${name} = ${val};`);
      } else {
        lines.push(`export const ${name} = undefined;`);
      }
    } catch {
      lines.push(`export const ${name} = noop;`);
    }
  }

  return lines.join("\n");
}

const SQL_TABLE_EXPORT_NAMES = [
  "agentTable",
  "approvalRequestTable",
  "authAuditEventTable",
  "authBootstrapJtiSeenTable",
  "authIdentityCreatedAtDefault",
  "authIdentityTable",
  "authOwnerBindingTable",
  "authOwnerLoginTokenTable",
  "authSessionTable",
  "cacheTable",
  "channelTable",
  "channelParticipantsTable",
  "componentTable",
  "embeddingTable",
  "entityTable",
  "entityIdentityTable",
  "entityMergeCandidateTable",
  "factCandidateTable",
  "logTable",
  "longTermMemories",
  "memoryTable",
  "memoryAccessLogs",
  "messageTable",
  "messageServerTable",
  "messageServerAgentsTable",
  "pairingAllowlistTable",
  "pairingRequestTable",
  "participantTable",
  "relationshipTable",
  "roomTable",
  "serverTable",
  "sessionSummaries",
  "taskTable",
  "worldTable",
];

function generatePluginSqlStub(strippedId: string): string | null {
  if (
    strippedId !== "@elizaos/plugin-sql/schema" &&
    strippedId !== "@elizaos/plugin-sql"
  ) {
    return null;
  }

  return [
    "const handler = { get: () => table, apply: () => table };",
    "const table = new Proxy(function table() {}, handler);",
    ...SQL_TABLE_EXPORT_NAMES.map((name) => `export const ${name} = table;`),
    ...(strippedId === "@elizaos/plugin-sql"
      ? [
          "export const PGLITE_ERROR_CODES = Object.freeze({ ACTIVE_LOCK: 'ACTIVE_LOCK', CORRUPT_DATA: 'CORRUPT_DATA', MANUAL_RESET_REQUIRED: 'MANUAL_RESET_REQUIRED' });",
          "export const getPgliteErrorCode = () => null;",
          "export const createPgliteInitError = (_code, message) => new Error(message);",
          "export const plugin = table;",
        ]
      : []),
    "export default table;",
  ].join("\n");
}

function generateNodeLlamaCppStub(): string {
  return [
    "const handler = { get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : typeof p === 'string' ? (() => {}) : undefined) };",
    "const stub = new Proxy({}, handler);",
    "export default stub;",
    "export const getLlama = () => Promise.resolve(stub);",
    "export const LlamaLogLevel = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });",
    "export const Llama = stub;",
    "export const LlamaModel = stub;",
    "export const LlamaEmbeddingContext = stub;",
    "export const LlamaContext = stub;",
    "export const LlamaChatSession = stub;",
    "export const LlamaGrammar = stub;",
    "export const LlamaJsonSchemaGrammar = stub;",
  ].join("\n");
}

function generateFsExtraStub(): string {
  return [
    "const noop = () => {};",
    "const stub = new Proxy({}, { get: () => noop });",
    "export default stub;",
    ...[
      "copy",
      "copySync",
      "move",
      "moveSync",
      "remove",
      "removeSync",
      "ensureDir",
      "ensureDirSync",
      "ensureFile",
      "ensureFileSync",
      "mkdirs",
      "mkdirsSync",
      "readJson",
      "readJsonSync",
      "writeJson",
      "writeJsonSync",
      "pathExists",
      "pathExistsSync",
      "outputFile",
      "outputFileSync",
      "outputJson",
      "outputJsonSync",
      "emptyDir",
      "emptyDirSync",
    ].map((n) => `export const ${n} = noop;`),
  ].join("\n");
}

function generateTelegramStub(strippedId: string): string {
  if (strippedId.startsWith("telegram/sessions")) {
    return [
      "export class StringSession { constructor(value = '') { this.value = value; } }",
      "export default { StringSession };",
    ].join("\n");
  }

  return [
    "const noop = () => {};",
    "class SignIn { constructor(input = {}) { Object.assign(this, input); } }",
    "class Authorization { constructor(input = {}) { Object.assign(this, input); } }",
    "const Api = Object.freeze({ auth: Object.freeze({ SignIn, Authorization }) });",
    "class TelegramClient {}",
    "export { Api, TelegramClient };",
    "export default { Api, TelegramClient, noop };",
  ].join("\n");
}

function generateEventsStub(): string {
  return [
    "function EventEmitter() {}",
    "EventEmitter.prototype.on = function() { return this; };",
    "EventEmitter.prototype.off = function() { return this; };",
    "EventEmitter.prototype.emit = function() { return false; };",
    "EventEmitter.prototype.addListener = EventEmitter.prototype.on;",
    "EventEmitter.prototype.removeListener = EventEmitter.prototype.off;",
    "export { EventEmitter };",
    "export default EventEmitter;",
  ].join("\n");
}

function generateUndiciStub(): string {
  return [
    "export const fetch = globalThis.fetch;",
    "export const Request = globalThis.Request;",
    "export const Response = globalThis.Response;",
    "export const Headers = globalThis.Headers;",
    "export const FormData = globalThis.FormData;",
    "export const WebSocket = globalThis.WebSocket;",
    "export const EventSource = globalThis.EventSource || class {};",
    "export const AbortController = globalThis.AbortController;",
    "export const File = globalThis.File;",
    "export const Blob = globalThis.Blob;",
    "export class Agent {}",
    "export class Pool {}",
    "export class Client {}",
    "export class Dispatcher {}",
    "export const setGlobalDispatcher = () => {};",
    "export const getGlobalDispatcher = () => ({});",
    "export default { fetch, Request, Response, Headers, WebSocket };",
  ].join("\n");
}

function generateAsyncHooksStub(): string {
  return [
    "function AsyncLocalStorage() {} AsyncLocalStorage.prototype.getStore = function() { return undefined; }; AsyncLocalStorage.prototype.run = function(store, fn) { return fn.apply(void 0, [].slice.call(arguments, 2)); }; AsyncLocalStorage.prototype.enterWith = function() {}; AsyncLocalStorage.prototype.disable = function() {};",
    "export { AsyncLocalStorage };",
    "export function executionAsyncId() { return 0; }",
    "export function triggerAsyncId() { return 0; }",
    "export function executionAsyncResource() { return {}; }",
    "function AsyncResource() {} AsyncResource.prototype.runInAsyncScope = function(fn) { return fn.apply(void 0, [].slice.call(arguments, 1)); }; AsyncResource.prototype.emitDestroy = function() { return this; }; AsyncResource.prototype.asyncId = function() { return 0; }; AsyncResource.prototype.triggerAsyncId = function() { return 0; };",
    "export { AsyncResource };",
    "export function createHook() { return { enable: function(){}, disable: function(){} }; }",
    "export default { AsyncLocalStorage: AsyncLocalStorage, AsyncResource: AsyncResource, executionAsyncId: executionAsyncId, triggerAsyncId: triggerAsyncId, executionAsyncResource: executionAsyncResource, createHook: createHook };",
  ].join("\n");
}

function generateSharpStub(): string {
  return [
    "function mk() {",
    "  const c = {",
    "    rotate() { return c; },",
    "    resize() { return c; },",
    "    greyscale() { return c; },",
    "    png() { return c; },",
    "    jpeg() { return c; },",
    "    async toBuffer() { return new Uint8Array(0); },",
    "    async raw() { return { data: new Uint8Array(0), info: { width: 1, height: 1, channels: 1 } }; },",
    "  };",
    "  return c;",
    "}",
    "export default function sharp() { return mk(); }",
  ].join("\n");
}

function generatePluginSqlDrizzleStub(): string {
  return [
    "const expr = {};",
    "export const and = () => expr;",
    "export const desc = () => expr;",
    "export const eq = () => expr;",
    "export const isNull = () => expr;",
    "export const lte = () => expr;",
    "export const ne = () => expr;",
    "export default expr;",
  ].join("\n");
}

function generateCapacitorHapticsStub(): string {
  return [
    "const noop = () => {};const noopObj = new Proxy({}, { get: () => noop });",
    "export const Haptics = noopObj;",
    "export const ImpactStyle = Object.freeze({ Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' });",
    "export const NotificationType = Object.freeze({ Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' });",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorKeyboardStub(): string {
  return [
    "const noop = () => {};const noopObj = new Proxy({}, { get: () => noop });",
    "export const Keyboard = noopObj;",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorPreferencesStub(): string {
  return [
    "const noop = () => Promise.resolve({ value: null });const noopObj = new Proxy({}, { get: () => noop });",
    "export const Preferences = noopObj;",
    "export default noopObj;",
  ].join("\n");
}

function generateCapacitorPushNotificationsStub(): string {
  return [
    "const asyncNoop = async () => {};",
    "const listenerHandle = { remove: asyncNoop };",
    "export const PushNotifications = {",
    "  requestPermissions: async () => ({ receive: 'denied' }),",
    "  addListener: async () => listenerHandle,",
    "  register: asyncNoop,",
    "  removeAllListeners: asyncNoop,",
    "};",
    "export default PushNotifications;",
  ].join("\n");
}

function generateCapacitorBarcodeScannerStub(): string {
  return [
    "const asyncNoop = async () => ({ ScanResult: '' });",
    "export const CapacitorBarcodeScanner = { scanBarcode: asyncNoop };",
    "export const CapacitorBarcodeScannerTypeHint = Object.freeze({ QR_CODE: 'QR_CODE' });",
    "export default CapacitorBarcodeScanner;",
  ].join("\n");
}

const CAPACITOR_NATIVE_STUB_GENERATORS = new Map<string, () => string>([
  ["@capacitor/haptics", generateCapacitorHapticsStub],
  ["@capacitor/keyboard", generateCapacitorKeyboardStub],
  ["@capacitor/preferences", generateCapacitorPreferencesStub],
  ["@capacitor/push-notifications", generateCapacitorPushNotificationsStub],
  ["@capacitor/barcode-scanner", generateCapacitorBarcodeScannerStub],
]);

function generateCapacitorNativeStub(strippedId: string): string {
  const capPkg = strippedId.split("/").slice(0, 2).join("/");
  const stubGenerator = CAPACITOR_NATIVE_STUB_GENERATORS.get(capPkg);
  if (stubGenerator) return stubGenerator();

  return [
    "const noop = () => {};const stub = new Proxy({}, { get: () => noop });",
    "export default stub;",
  ].join("\n");
}

const NATIVE_MODULE_STUB_GENERATORS = new Map<
  string,
  (strippedId: string) => string
>([
  ["node-llama-cpp", generateNodeLlamaCppStub],
  ["fs-extra", generateFsExtraStub],
  ["telegram", generateTelegramStub],
  ["events", generateEventsStub],
  ["undici", generateUndiciStub],
  ["node:async_hooks", generateAsyncHooksStub],
  ["async_hooks", generateAsyncHooksStub],
]);

function isSharpStubId(strippedId: string): boolean {
  return (
    strippedId === "sharp" ||
    strippedId.startsWith("sharp/") ||
    strippedId.startsWith("@img/sharp")
  );
}

function generateNativeModuleStub(
  strippedId: string,
  capacitorNativeScopeRe: RegExp,
): string {
  const modName = strippedId.split("/")[0];
  const stubGenerator = NATIVE_MODULE_STUB_GENERATORS.get(modName);
  if (stubGenerator) return stubGenerator(strippedId);
  if (modName.startsWith("node:")) return generateNodeBuiltinStub(strippedId);
  if (isSharpStubId(strippedId)) return generateSharpStub();
  if (strippedId === "@elizaos/plugin-sql/drizzle")
    return generatePluginSqlDrizzleStub();

  const pluginSqlStub = generatePluginSqlStub(strippedId);
  if (pluginSqlStub) return pluginSqlStub;
  if (capacitorNativeScopeRe.test(strippedId))
    return generateCapacitorNativeStub(strippedId);

  return "export default {};\n";
}

/**
 * Dev-mode plugin that stubs native-only packages.  In production builds
 * rollupOptions.external handles this, but the Vite dev server still tries
 * to resolve + serve excluded deps.  This plugin intercepts the import at
 * the resolveId stage and returns an empty virtual module so Vite never
 * touches the real CJS files (which fail ESM named-export checks).
 */
function nativeModuleStubPlugin(): Plugin {
  const VIRTUAL_PREFIX = "\0native-stub:";
  // Packages that only run on the server / desktop and must never be
  // parsed by Vite's dev pipeline.
  const nativePackages = new Set([
    "node-llama-cpp",
    "fs-extra",
    "pty-state-capture",
    "electron",
    "undici",
    "@elizaos/plugin-local-embedding",
    // Edge-TTS is a Node-only voice plugin. Its package.json declares
    // `./dist/browser/index.browser.js` under the `browser` export
    // condition, but that file is never built (only `dist/node/` ships,
    // and even that isn't prebuilt for staging — plugin-edge-tts isn't
    // in the Dockerfile build_pkg list). alice's
    // `packages/app-core/src/runtime/eliza.ts` imports it eagerly for
    // the server runtime. In the SPA build the runtime/eliza module is
    // unreachable, but vite still resolves the bare specifier while
    // walking the module graph. Stubbing here matches the existing
    // pattern for @elizaos/plugin-local-embedding.
    "@elizaos/plugin-edge-tts",
    // @node-rs/argon2 is a Node-native password-hashing module, declared as a
    // direct dep of @elizaos/app-core (used for credential hashing on the
    // server). Its package.json exposes a `browser` export condition pointing
    // at `browser.js`, which dynamically imports the optional WASM peer
    // `@node-rs/argon2-wasm32-wasi`. That peer is not installed in alice's
    // workspace (it's an optional dep), so the browser resolution fails.
    // The SPA never executes credential hashing (all auth flows live on the
    // server), so stubbing here is safe.
    "@node-rs/argon2",
    // mammoth (statically imported from @elizaos/core/src/features/knowledge/
    // utils.ts) calls fs.readFile.bind(fs) inside its DocumentXmlReader factory
    // at module init. In a browser where fs is stubbed empty that lookup throws
    // TypeError and kills SPA boot. The paired core/build.ts patch externalizes
    // mammoth in the dist; this entry stubs it in the SPA build so the bare
    // import emitted by core gets replaced with a Proxy noop instead of being
    // resolved and bundled by Vite. The shared eliza/packages/app stub plugin
    // has the same entry; both are needed because each Vite config runs its
    // own copy of nativeModuleStubPlugin.
    "mammoth",
  ]);
  const nativeScopeRe = /^@node-llama-cpp\//;

  return {
    name: "native-module-stub",
    enforce: "pre",
    resolveId(id) {
      // Intercept ALL node: builtins before Vite externalizes them.
      // The @elizaos/core node entry uses many Node APIs (crypto, fs, module,
      // etc.) at the top level.  Rather than stubbing each one individually,
      // we return a Proxy-based virtual module for any node: import.
      if (id.startsWith("node:")) return VIRTUAL_PREFIX + id;
      // Also catch bare imports of Node builtins that get resolved differently
      const nodeBuiltins = new Set([
        "module",
        "crypto",
        "fs",
        "path",
        "os",
        "url",
        "util",
        "stream",
        "http",
        "https",
        "net",
        "tls",
        "zlib",
        "child_process",
        "worker_threads",
        "perf_hooks",
        "async_hooks",
        "dns",
        "dgram",
        "readline",
        "tty",
        "cluster",
        "v8",
        "vm",
        "assert",
        "buffer",
        "string_decoder",
        "querystring",
        "punycode",
      ]);
      if (nodeBuiltins.has(id) || nodeBuiltins.has(id.split("/")[0]))
        return `${VIRTUAL_PREFIX}node:${id}`;
      const bare = id.startsWith("@")
        ? id.split("/").slice(0, 2).join("/")
        : id.split("/")[0];
      // Scoped: @node-llama-cpp/*
      if (nativeScopeRe.test(id)) return VIRTUAL_PREFIX + id;
      // Exact or sub-path match against native packages
      if (nativePackages.has(bare)) return VIRTUAL_PREFIX + id;
      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const modName = id.slice(VIRTUAL_PREFIX.length).split("/")[0];
      // node-llama-cpp is the most import-heavy native module — its consumers
      // use many named exports (LlamaLogLevel, getLlama, etc.).  Return a
      // module whose default export is a Proxy that returns no-op stubs for
      // any property access, AND re-export that proxy as every known name so
      // static `import { X }` statements resolve without error.
      if (modName === "node-llama-cpp") {
        return [
          "const handler = { get: (_, p) => (p === Symbol.toPrimitive ? () => 0 : typeof p === 'string' ? (() => {}) : undefined) };",
          "const stub = new Proxy({}, handler);",
          "export default stub;",
          // Known named exports used by @elizaos/plugin-local-embedding and
          // other consumers — extend as needed:
          "export const getLlama = () => Promise.resolve(stub);",
          "export const LlamaLogLevel = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });",
          "export const Llama = stub;",
          "export const LlamaModel = stub;",
          "export const LlamaEmbeddingContext = stub;",
          "export const LlamaContext = stub;",
          "export const LlamaChatSession = stub;",
          "export const LlamaGrammar = stub;",
          "export const LlamaJsonSchemaGrammar = stub;",
        ].join("\n");
      }

      // fs-extra: CJS module with default + named exports
      if (modName === "fs-extra") {
        return [
          "const noop = () => {};",
          "const stub = new Proxy({}, { get: () => noop });",
          "export default stub;",
          // Re-export common fs-extra named exports so static imports work:
          ...[
            "copy",
            "copySync",
            "move",
            "moveSync",
            "remove",
            "removeSync",
            "ensureDir",
            "ensureDirSync",
            "ensureFile",
            "ensureFileSync",
            "mkdirs",
            "mkdirsSync",
            "readJson",
            "readJsonSync",
            "writeJson",
            "writeJsonSync",
            "pathExists",
            "pathExistsSync",
            "outputFile",
            "outputFileSync",
            "outputJson",
            "outputJsonSync",
            "emptyDir",
            "emptyDirSync",
          ].map((n) => `export const ${n} = noop;`),
        ].join("\n");
      }

      // events: CJS module, consumers use `import { EventEmitter } from "events"`
      if (modName === "events") {
        return [
          "function EventEmitter() {}",
          "EventEmitter.prototype.on = function() { return this; };",
          "EventEmitter.prototype.off = function() { return this; };",
          "EventEmitter.prototype.emit = function() { return false; };",
          "EventEmitter.prototype.addListener = EventEmitter.prototype.on;",
          "EventEmitter.prototype.removeListener = EventEmitter.prototype.off;",
          "export { EventEmitter };",
          "export default EventEmitter;",
        ].join("\n");
      }

      // undici: Node HTTP client — re-export browser globals (fetch, WebSocket, etc.)
      if (modName === "undici") {
        return [
          "export const fetch = globalThis.fetch;",
          "export const Request = globalThis.Request;",
          "export const Response = globalThis.Response;",
          "export const Headers = globalThis.Headers;",
          "export const FormData = globalThis.FormData;",
          "export const WebSocket = globalThis.WebSocket;",
          "export const EventSource = globalThis.EventSource || class {};",
          "export const AbortController = globalThis.AbortController;",
          "export const File = globalThis.File;",
          "export const Blob = globalThis.Blob;",
          "export class Agent {}",
          "export class Pool {}",
          "export class Client {}",
          "export class Dispatcher {}",
          "export const setGlobalDispatcher = () => {};",
          "export const getGlobalDispatcher = () => ({});",
          "export default { fetch, Request, Response, Headers, WebSocket };",
        ].join("\n");
      }

      // async_hooks — AsyncLocalStorage must be a real constructor because
      // langsmith and @elizaos packages do `new AsyncLocalStorage()` at the
      // top level. Uses function-constructor syntax (not class expressions)
      // for maximum WebView compatibility. The renderChunk plugin
      // (asyncLocalStoragePatchPlugin) also patches the final bundle output
      // as a safety net for patterns inlined by Rollup.
      if (modName === "node:async_hooks" || modName === "async_hooks") {
        return [
          "function AsyncLocalStorage() {} AsyncLocalStorage.prototype.getStore = function() { return undefined; }; AsyncLocalStorage.prototype.run = function(store, fn) { return fn.apply(void 0, [].slice.call(arguments, 2)); }; AsyncLocalStorage.prototype.enterWith = function() {}; AsyncLocalStorage.prototype.disable = function() {};",
          "export { AsyncLocalStorage };",
          "export function executionAsyncId() { return 0; }",
          "export function triggerAsyncId() { return 0; }",
          "export function executionAsyncResource() { return {}; }",
          "function AsyncResource() {} AsyncResource.prototype.runInAsyncScope = function(fn) { return fn.apply(void 0, [].slice.call(arguments, 1)); }; AsyncResource.prototype.emitDestroy = function() { return this; }; AsyncResource.prototype.asyncId = function() { return 0; }; AsyncResource.prototype.triggerAsyncId = function() { return 0; };",
          "export { AsyncResource };",
          "export function createHook() { return { enable: function(){}, disable: function(){} }; }",
          "export default { AsyncLocalStorage: AsyncLocalStorage, AsyncResource: AsyncResource, executionAsyncId: executionAsyncId, triggerAsyncId: triggerAsyncId, executionAsyncResource: executionAsyncResource, createHook: createHook };",
        ].join("\n");
      }

      // node:* builtins — return a Proxy-based module that provides any
      // named export as a no-op function.  This handles @elizaos/core's node
      // entry which uses createRequire, randomUUID, fs, etc. at the top level.
      if (modName.startsWith("node:")) {
        // Dynamic: read the real Node module's export names at config time
        // and generate matching no-op stubs so esbuild's static analysis passes.
        return generateNodeBuiltinStub(id.slice(VIRTUAL_PREFIX.length));
      }

      // Generic fallback for other native modules
      return "export default {};\n";
    },
    // Patch @elizaos/core browser entry at transform time to add missing
    // exports and fix browser-incompatible patterns.
    transform(code, id) {
      const isCoreDistFile =
        id.endsWith("index.browser.js") || id.endsWith("index.node.js");
      const normId = id.split(path.sep).join("/");
      const isCorePackagePath =
        normId.includes("/node_modules/@elizaos/core/") ||
        normId.includes("packages/core/dist/");
      if (!isCoreDistFile || !isCorePackagePath) return null;

      // Fix AsyncLocalStorage: the browser entry has a try/catch that does
      //   let {AsyncLocalStorage:$} = (() => {throw new Error(...)})()
      // Rollup/esbuild may optimize the throw into (()=>({})) which makes
      // AsyncLocalStorage undefined, causing "xte is not a constructor".
      // Replace the broken IIFE pattern with a working stub class.
      const patched = code.replace(
        /\(\(\)\s*=>\s*\{\s*throw\s+new\s+Error\(\s*"Cannot require module "\s*\+\s*"node:async_hooks"\s*\)\s*;\s*\}\)\(\)/g,
        "(function(){function A(){} A.prototype.getStore=function(){return undefined};A.prototype.run=function(s,fn){return fn.apply(void 0,[].slice.call(arguments,2))};A.prototype.enterWith=function(){};A.prototype.disable=function(){};return{AsyncLocalStorage:A}})()",
      );
      // Names that downstream plugins and the agent runtime
      // import from @elizaos/core but that are missing from the browser entry.
      const missingExports: Record<string, string> = {
        resolveSecretKeyAlias: "function(k){return k}",
        SECRET_KEY_ALIASES: "{}",
        OnboardingStateMachine: "function(){}",
        isOnboardingComplete: "function(){return false}",
        AgentEventService: "function(){}",
        AutonomyService: "function(){}",
        createBasicCapabilitiesPlugin: "function(){return{name:'stub'}}",
      };
      // Check which are actually missing from the existing export block
      const needed = Object.keys(missingExports).filter((n) => {
        // Check if already exported (as named export or re-export alias)
        const exportedAs = new RegExp(`\\b${n}\\b`);
        // Search only in export{} blocks
        const exportBlocks = patched.match(/export\s*\{[^}]+\}/g) || [];
        return !exportBlocks.some((b) => exportedAs.test(b));
      });
      if (needed.length === 0 && patched === code) return null;
      // Use unique prefixed names to avoid collisions with minified vars
      const prefix = "__milady_stub_";
      const stubs = needed
        .map((n) => `var ${prefix}${n} = ${missingExports[n]};`)
        .join("\n");
      const exports =
        needed.length > 0
          ? `export { ${needed.map((n) => `${prefix}${n} as ${n}`).join(", ")} };`
          : "";
      return { code: `${patched}\n${stubs}\n${exports}`, map: null };
    },
  };
}

/**
 * Patch the final bundle output to fix AsyncLocalStorage stubs.
 *
 * langsmith imports `{ AsyncLocalStorage } from "node:async_hooks"` at the
 * top level. Vite's dep optimizer and Rollup inline the virtual-module stub
 * as `(()=>({}))`, making AsyncLocalStorage `undefined` and causing
 * `new undefined` → "xte is not a constructor" at runtime in mobile webviews.
 *
 * This plugin replaces the empty-object stub with a proper class in the
 * final rendered chunks.
 */
function asyncLocalStoragePatchPlugin(): Plugin {
  return {
    name: "async-local-storage-patch",
    enforce: "post",
    renderChunk(code) {
      // Match: var{AsyncLocalStorage:<id>}=(()=>({}))
      const re =
        /var\s*\{\s*AsyncLocalStorage\s*:\s*(\w+)\s*\}\s*=\s*\(\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)\s*\)/g;
      if (!re.test(code)) return null;
      re.lastIndex = 0;
      const patched = code.replace(re, (_match, id) => {
        // Use block-body arrow + named class — concise arrow with inline
        // anonymous class fails in older WebViews (Chrome 124 and below).
        return `var{AsyncLocalStorage:${id}}=(()=>{function A(){} A.prototype.getStore=function(){return undefined};A.prototype.run=function(s,fn){return fn.apply(void 0,[].slice.call(arguments,2))};A.prototype.enterWith=function(){};A.prototype.disable=function(){};return{AsyncLocalStorage:A}})()`;
      });
      return { code: patched, map: null };
    },
  };
}

function watchWorkspacePackagesPlugin(): Plugin {
  return {
    name: "watch-workspace-packages",
    configureServer(server) {
      server.watcher.add(path.resolve(miladyRoot, "packages"));
      server.watcher.on("change", (file) => {
        if (file.includes("/packages/")) {
          if (file.endsWith("package.json")) {
            server.restart();
          } else {
            // Force a full reload on any other package file change (e.g. ts/tsx files)
            server.ws.send({ type: "full-reload" });
          }
        }
      });
    },
  };
}

// Diagnostic plugin: surface the real build failure in CI/deploy logs.
//
// The CI deploy host was rendering `error during build: undefined` for every
// failed alice deploy because Vite's CLI error catcher does
// `err.stack || err.message || err` — when something throws a non-Error
// value (or an object whose stack/message strip to nothing through stdout
// buffering) the message collapses to "undefined" and the underlying cause
// is invisible.
//
// `buildEnd(error)` fires after the input phase regardless of success, with
// the rollup error passed in when the build failed. Stringifying the error
// here (including stack/name/code/loc/plugin/cause) before propagating
// guarantees the deploy log shows the actual cause even when Vite's catcher
// fails to format it.
function diagnoseBuildErrorPlugin(): Plugin {
  return {
    name: "diagnose-build-error",
    enforce: "post",
    buildEnd(error) {
      if (!error) return;
      try {
        process.stderr.write(
          `[vite-build-error] type=${typeof error} ctor=${(error as { constructor?: { name?: string } }).constructor?.name ?? "n/a"}\n`,
        );
        const fields = [
          "name",
          "code",
          "message",
          "plugin",
          "id",
          "loc",
          "frame",
          "cause",
          "stack",
        ] as const;
        const dump: Record<string, unknown> = {};
        for (const key of fields) {
          const value = (error as Record<string, unknown>)[key];
          if (value !== undefined) dump[key] = value;
        }
        process.stderr.write(
          `[vite-build-error] dump=${JSON.stringify(dump, null, 2)}\n`,
        );
        const stack = (error as { stack?: string }).stack;
        if (typeof stack === "string") {
          process.stderr.write(`[vite-build-error] stack:\n${stack}\n`);
        }
      } catch (writeErr) {
        process.stderr.write(
          `[vite-build-error] failed to serialise build error: ${String(writeErr)}\n`,
        );
      }
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  // Keep pre-bundle cache under the app dir (not node_modules/.vite) so Bun
  // installs don't fight Vite, and `bun run clean` / docs can target one path.
  cacheDir: path.resolve(here, ".vite"),
  publicDir: path.resolve(here, "public"),
  define: {
    global: "globalThis",
    // Mirror MILADY_TTS_DEBUG into the client bundle so one env enables UI + server TTS logs in dev.
    "import.meta.env.MILADY_TTS_DEBUG": JSON.stringify(
      process.env.MILADY_TTS_DEBUG ?? "",
    ),
    // Settings load/save trace (MiladyClient + shared isMiladySettingsDebugEnabled).
    "import.meta.env.MILADY_SETTINGS_DEBUG": JSON.stringify(
      process.env.MILADY_SETTINGS_DEBUG ?? "",
    ),
    "import.meta.env.VITE_MILADY_SETTINGS_DEBUG": JSON.stringify(
      process.env.VITE_MILADY_SETTINGS_DEBUG ?? "",
    ),
    "import.meta.env.VITE_ASSET_BASE_URL": JSON.stringify(
      process.env.VITE_ASSET_BASE_URL ??
        process.env.MILADY_ASSET_BASE_URL ??
        "",
    ),
  },
  plugins: [
    diagnoseBuildErrorPlugin(),
    nativeModuleStubPlugin(),
    asyncLocalStoragePatchPlugin(),
    watchWorkspacePackagesPlugin(),
    tailwindcss(),
    react(),
    desktopCorsPlugin(),
    miladyDevSettingsBannerPlugin(),
  ],
  esbuild: {
    // Override tsconfig target — some extended configs use ES2024 which older
    // esbuild does not recognize; this avoids "Unrecognized target environment"
    // warnings regardless of tsconfig resolution.
    target: "es2022",
  },
  resolve: {
    dedupe: ["react", "react-dom", "three", "@miladyai/app-core"],
    alias: [
      // Bare Node built-in polyfills for browser — pathe provides ESM path,
      // events is pre-bundled via optimizeDeps.
      { find: /^path$/, replacement: "pathe" },
      // Node built-in subpaths that browser polyfills don't provide.
      // Server-only code imports these but they're never executed in-browser.
      ...["util/types", "stream/promises", "stream/web"].flatMap((sub) => [
        {
          find: `node:${sub}`,
          replacement: path.resolve(here, "src/stubs/empty-node-module.ts"),
        },
        {
          find: sub,
          replacement: path.resolve(here, "src/stubs/empty-node-module.ts"),
        },
      ]),
      // Capacitor plugins — resolve to local plugin sources
      {
        find: /^@miladyai\/capacitor-agent$/,
        replacement: path.resolve(here, "plugins/agent/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-camera$/,
        replacement: path.resolve(here, "plugins/camera/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-canvas$/,
        replacement: path.resolve(here, "plugins/canvas/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-desktop$/,
        replacement: path.resolve(here, "plugins/desktop/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-gateway$/,
        replacement: path.resolve(here, "plugins/gateway/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-location$/,
        replacement: path.resolve(here, "plugins/location/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-mobile-signals$/,
        replacement: path.resolve(here, "plugins/mobile-signals/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-screencapture$/,
        replacement: path.resolve(here, "plugins/screencapture/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-swabble$/,
        replacement: path.resolve(here, "plugins/swabble/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-talkmode$/,
        replacement: path.resolve(here, "plugins/talkmode/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-websiteblocker$/,
        replacement: path.resolve(here, "plugins/websiteblocker/src/index.ts"),
      },
      {
        find: /^@miladyai\/plugin-selfcontrol\/(.*)/,
        replacement: path.resolve(
          miladyRoot,
          "packages/plugin-selfcontrol/src/$1",
        ),
      },
      {
        find: /^@miladyai\/plugin-selfcontrol$/,
        replacement: path.resolve(
          miladyRoot,
          "packages/plugin-selfcontrol/src/index.ts",
        ),
      },
      // Keep plugin-sql subpath imports on the repo-local source layout. Some
      // installed package copies can be stale enough to miss these exports.
      {
        find: /^@elizaos\/plugin-sql\/drizzle$/,
        replacement: path.join(pluginSqlSrcRoot, "drizzle/index.ts"),
      },
      {
        find: /^@elizaos\/plugin-sql\/schema$/,
        replacement: path.join(pluginSqlSrcRoot, "schema/index.ts"),
      },
      {
        find: /^@elizaos\/plugin-sql\/types$/,
        replacement: path.join(pluginSqlSrcRoot, "types.ts"),
      },
      // Force local @miladyai/app-core when workspace-linked (prevents stale
      // bun cache copies from overriding the symlinked local source).
      ...(() => {
        const appCorePkgPath = path.resolve(
          miladyRoot,
          "packages/app-core/package.json",
        );
        const agentPkgPath = path.resolve(
          miladyRoot,
          "packages/agent/package.json",
        );
        const sharedPkgPath = path.resolve(
          miladyRoot,
          "packages/shared/package.json",
        );
        // alice's apps/app/src/main.tsx imports many `@elizaos/<pkg>` and
        // `@elizaos/<pkg>/<subpath>` workspace packages — app-companion,
        // app-2004scape, app-babylon, app-hyperliquid, etc. plus
        // @elizaos/shared, @elizaos/ui, @elizaos/app-core. Each needs an
        // alias so rollup-plugin-commonjs doesn't have to walk the
        // exports field (which it gets wrong for workspace-symlinked
        // packages). The two walkers below cover the bulk; explicit
        // alias entries below cover @elizaos/shared, @elizaos/ui, and
        // @elizaos/app-core which aren't picked up by the walkers.
        const elizaSharedPkgPath = path.resolve(
          miladyRoot,
          "eliza/packages/shared/package.json",
        );
        const elizaUiPkgPath = path.resolve(
          miladyRoot,
          "eliza/packages/ui/package.json",
        );
        const elizaAppCorePkgPath = path.resolve(
          miladyRoot,
          "eliza/packages/app-core/package.json",
        );

        const generatedAliases = [
          ...buildWorkspaceExportAliases("@miladyai/app-core", appCorePkgPath),
          ...buildWorkspaceExportAliases("@miladyai/agent", agentPkgPath),
          ...buildWorkspaceExportAliases("@miladyai/shared", sharedPkgPath),
          // NOTE: @elizaos/app-wallet and @elizaos/app-lifeops are NOT
          // registered here via the exports-field builder anymore. They are
          // both `eliza/plugins/app-*` workspace packages, so they get
          // src-rooted aliases from `resolveElizaAppAliasEntries()` below.
          // The exports-field path would point at `dist/` which is built
          // shallowly (no `dist/components/<X>.js` for deep imports like
          // `@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect`)
          // and rollup would fail with `ENOENT`.
          //
          // Register the eliza packages that main.tsx imports by both
          // their @elizaos name (resolution comes from eliza's own
          // packages/* exports) and run through the export-aliases
          // builder so subpaths resolve too.
          ...(fs.existsSync(elizaSharedPkgPath)
            ? buildWorkspaceExportAliases("@elizaos/shared", elizaSharedPkgPath)
            : []),
          ...(fs.existsSync(elizaUiPkgPath)
            ? buildWorkspaceExportAliases("@elizaos/ui", elizaUiPkgPath)
            : []),
          ...(fs.existsSync(elizaAppCorePkgPath)
            ? buildWorkspaceExportAliases(
                "@elizaos/app-core",
                elizaAppCorePkgPath,
              )
            : []),
          // @elizaos/capacitor-<name> — dynamic walk of
          // eliza/packages/native-plugins/ for src/index.ts entries.
          ...resolveNativePluginAliasEntries(),
        ];

        // @elizaos/app-<name>{,/subpath} — dynamic walk of
        // eliza/plugins/app-* for every app-shaped workspace, plus a
        // stub-fallback alias for app names that don't exist locally
        // (e.g. main.tsx imports `@elizaos/app-workflow-builder/register`
        // but the package isn't in this eliza checkout).
        const { aliases: elizaAppAliases, realAppNames } =
          resolveElizaAppAliasEntries();
        generatedAliases.push(...elizaAppAliases);
        const optionalAppStub = resolveOptionalElizaAppStubAlias(realAppNames);
        if (optionalAppStub) generatedAliases.push(optionalAppStub);

        // Scope-rename alias for @clawville/app-clawville: the package.json
        // at eliza/plugins/app-clawville/ declares name "@elizaos/app-clawville",
        // but main.tsx imports it under "@clawville/app-clawville/ui" because
        // 555stream's deploy-555-bot-staging.sh materialize_pkg step
        // creates node_modules/@clawville/app-clawville/ at runtime. Vite
        // runs BEFORE that materialize step, so we register the
        // @clawville scope directly against the eliza source via
        // buildWorkspaceExportAliases.
        const clawvillePkgPath = path.resolve(
          miladyRoot,
          "eliza/plugins/app-clawville/package.json",
        );
        if (fs.existsSync(clawvillePkgPath)) {
          generatedAliases.push(
            ...buildElizaAppSourceAliases(
              "@clawville/app-clawville",
              path.dirname(clawvillePkgPath),
            ),
          );
        }

        const uiSource = path.resolve(miladyRoot, "packages/ui/src");
        const _autonomousSource = path.resolve(
          miladyRoot,
          "node_modules/@miladyai/agent/packages/agent/src",
        );

        return [
          ...generatedAliases,
          {
            find: /^@miladyai\/ui$/,
            replacement: path.join(uiSource, "index.ts"),
          },
          {
            find: /^@miladyai\/ui\/(.*)$/,
            replacement: `${uiSource}/$1/index.ts`, // assumes subpaths are directories
          },
          // NOTE: @elizaos/agent barrel re-exports server-only code (eliza.ts,
          // server.ts) that imports native modules (node-llama-cpp, node:module).
          // Nothing in the browser needs the barrel — only subpath imports like
          // @miladyai/agent/contracts/onboarding are used.  Map the bare import
          // to upstream eliza's comprehensive browser stub (which exports
          // ACCOUNT_CREDENTIAL_PROVIDER_IDS, getAccessToken, listProviderAccounts,
          // and ~140 other server-only names as no-ops).  Upstream provides this
          // stub specifically for browser builds — using the local
          // `src/stubs/empty-node-module.ts` instead causes Rollup to fail with
          // `"ACCOUNT_CREDENTIAL_PROVIDER_IDS" is not exported by ...stubs/empty-node-module.ts`
          // when files like eliza/packages/app-core/src/services/account-pool.ts
          // (pulled in via the @elizaos/app-core barrel from main.tsx) try to
          // statically import from @elizaos/agent.  The browser never executes
          // any of these — eliza/packages/app-core's services/account-pool.ts is
          // gated behind `isMobilePlatform()` / `isNode()` checks at runtime.
          {
            find: /^@elizaos\/agent$/,
            replacement: path.resolve(
              miladyRoot,
              "eliza/packages/app-core/src/platform/elizaos-agent-browser-stub.ts",
            ),
          },
          // @elizaos/core — force ALL copies (including nested ones in plugins
          // like plugin-secrets-manager that ship their own older core) to the
          // main workspace copy's browser entry.  The browser entry has all
          // needed exports and avoids pulling in createRequire/node:fs/etc.
          {
            find: /^@elizaos\/core$/,
            replacement: resolveElizaCoreBundlePath(),
          },
        ];
      })(),
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      // Three.js core + all subpath imports must be pre-bundled together so
      // esbuild shares a single module identity.
      "three",
      "three/examples/jsm/controls/OrbitControls.js",
      "three/examples/jsm/libs/meshopt_decoder.module.js",
      "three/examples/jsm/loaders/DRACOLoader.js",
      "three/examples/jsm/loaders/GLTFLoader.js",
      "three/examples/jsm/loaders/FBXLoader.js",
      "three/examples/jsm/webxr/VRButton.js",
      // CJS polyfills that browser deps import as ESM named exports —
      // pre-bundling converts them so Vite can serve named imports.
      "events",
      "util",
      "buffer",
      "stream-browserify",
    ],
    // Remap node: builtins to npm polyfills during dep optimization so
    // esbuild doesn't externalize them as "browser-external:node:*".
    esbuildOptions: {
      // Must match build/esbuild targets: Vite's dep optimizer otherwise
      // defaults to legacy browser targets (chrome87, safari14, …) and
      // esbuild fails with "Transforming destructuring … is not supported yet"
      // across modern node_modules (Radix, three, zod, etc.).
      target: "es2022",
      plugins: [
        {
          name: "node-builtins-polyfill",
          setup(build) {
            // Map node: builtins to their npm polyfill packages.
            // require.resolve("events") returns the bare name on Node 22+, so
            // we resolve via the polyfill's package.json to get an absolute path.
            const polyfills: Record<string, string> = {};
            for (const [nodeId, pkg, entry] of [
              ["node:events", "events", "events.js"],
              ["node:buffer", "buffer", "index.js"],
              ["node:util", "util", "util.js"],
              ["node:process", "process", "browser.js"],
              ["node:stream", "stream-browserify", "index.js"],
              ["stream", "stream-browserify", "index.js"],
            ] as const) {
              try {
                const pkgDir = path.dirname(
                  _require.resolve(`${pkg}/package.json`),
                );
                polyfills[nodeId] = path.join(pkgDir, entry);
              } catch {
                // polyfill not installed
              }
            }
            for (const [nodeId, absPath] of Object.entries(polyfills)) {
              const re = new RegExp(`^${nodeId.replace(":", "\\:")}$`);
              build.onResolve({ filter: re }, () => ({ path: absPath }));
            }
            // For all OTHER node: builtins, provide empty stubs via
            // generateNodeBuiltinStub so esbuild doesn't externalize them.
            build.onResolve({ filter: /^node:/ }, (args) => ({
              path: args.path,
              namespace: "node-stub",
            }));
            build.onLoad({ filter: /.*/, namespace: "node-stub" }, (args) => ({
              contents: generateNodeBuiltinStub(args.path),
              loader: "js",
            }));
          },
        },
      ],
    },
    exclude: [
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture import; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
      // Ships its own @elizaos/core copy that references exports missing from
      // the browser entry; skip pre-bundling so it's served on-demand via the
      // transform plugin that patches missing exports.
      "@elizaos/plugin-secrets-manager",
      // Node-only HTTP client — crashes in browser, stub via nativeModuleStubPlugin
      "undici",
      // Native LLM embedding — uses node-llama-cpp, never runs in browser
      "@elizaos/plugin-local-embedding",
      // Node-only Edge-TTS voice plugin; browser entry is an unbuilt stub.
      // Pairs with the nativePackages entry — esbuild's pre-bundle pass would
      // otherwise hit the package before the stub plugin gets a chance.
      "@elizaos/plugin-edge-tts",
      // Native argon2 password hashing — declared by @elizaos/app-core for
      // server-side credential hashing. Browser entry imports an optional
      // WASM peer (@node-rs/argon2-wasm32-wasi) that isn't installed.
      "@node-rs/argon2",
      // OS keychain binding is desktop/server-only and pulls native .node assets.
      "@napi-rs/keyring",
    ],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    // Watch + incremental: avoid wiping dist each cycle; keeps Electrobun reloads fast.
    emptyOutDir: !desktopFastDist,
    sourcemap: desktopFastDist ? false : enableAppSourceMaps,
    target: "es2022",
    // The desktop/web shell intentionally ships a large eagerly-loaded main
    // chunk; warn only when it grows beyond the current known baseline.
    chunkSizeWarningLimit: 3800,
    minify: desktopFastDist ? false : undefined,
    cssMinify: desktopFastDist ? false : undefined,
    reportCompressedSize: !desktopFastDist,
    rollupOptions: {
      // Print every rollup warning verbatim to stderr before delegating to
      // the default handler. Without this, @vitejs/plugin-react-swc's
      // silenceUseClientWarning wrapper + the build environment's stdout
      // post-processing can collapse an UNRESOLVED_IMPORT error to a
      // bare "undefined" line in the CI/deploy log, hiding the failing
      // module path. Keep this delegate-then-default shape so we don't
      // suppress vite's own escalation of warnings to build errors.
      onwarn(warning, defaultHandler) {
        const code = warning.code ?? "WARN";
        const loc =
          warning.loc?.file ?? warning.id ?? warning.importer ?? "<unknown>";
        const msg = warning.message ?? "<no message>";
        process.stderr.write(
          `[vite-build-warning] ${code} at ${loc}: ${msg}\n`,
        );
        defaultHandler(warning);
      },
      // Native-only deps that must not be resolved during the browser build.
      // Node built-ins (node:fs, fs, path, etc.) are NOT externalized here —
      // they are intercepted by nativeModuleStubPlugin which replaces them
      // with no-op Proxy stubs. Externalizing them causes Rollup to emit
      // bare `import "node:fs"` in output chunks, which the browser rejects
      // with a CSP violation.
      external: (id) => {
        if (
          [
            "pty-state-capture",
            "electron",
            "node-llama-cpp",
            "pty-manager",
          ].includes(id)
        )
          return true;
        // OS keychain native addon. Renderer never calls keyring directly —
        // it goes through the API. Externalize the umbrella + platform
        // binaries so Rollup doesn't try to bundle the .node files.
        if (/^@napi-rs\/keyring(-.+)?$/.test(id)) return true;
        if (/^@node-llama-cpp\//.test(id)) return true;
        if (/^@napi-rs\/keyring/.test(id)) return true;
        return false;
      },
      input: {
        main: path.resolve(here, "index.html"),
        screenshotter: path.resolve(here, "public_src/screenshotter.html"),
      },
      output: {
        manualChunks: resolveManualChunk,
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    host: true,
    port: uiPort,
    strictPort: true,
    // Electrobun/WKWebView runs the renderer in a null-origin context. When
    // Vite leaves dev asset URLs relative, worker source-map lookups can turn
    // into malformed blob://nullhttp//... requests. Pin the dev origin so
    // worker chunks, source maps, and HMR all resolve against loopback.
    // Keep MILADY_HMR_HOST as an override for remote HMR / VPS development.
    origin: `http://127.0.0.1:${uiPort}`,
    hmr: {
      host: process.env.MILADY_HMR_HOST || "127.0.0.1",
      port: uiPort,
    },
    cors: {
      origin: true,
      credentials: true,
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "API server unavailable" }));
            }
          });
        },
      },
      "/ws": {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
        configure: (proxy) => {
          // Suppress noisy ECONNREFUSED errors during API restart.
          // Clients reconnect automatically via the WS reconnect loop.
          proxy.on("error", () => {});
        },
      },
      // elizaOS plugin-music-player HTTP routes live outside /api (e.g. /music-player/stream).
      "/music-player": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "API server unavailable" }));
            }
          });
        },
      },
    },
    fs: {
      // Allow serving files from the app directory and milady src
      allow: [here, miladyRoot],
    },
    watch: {
      // Polling is only needed in Docker/WSL where native fs events are unreliable
      usePolling: process.env.MILADY_DEV_POLLING === "1",
      // Electrobun postBuild copies renderer HTML/assets into electrobun/build/.
      // Watching those paths triggers full reloads while deps are still optimizing,
      // which breaks with "chunk-*.js does not exist" in node_modules/.vite/deps.
      ignored: ["**/electrobun/build/**", "**/electrobun/artifacts/**"],
    },
  },
});
