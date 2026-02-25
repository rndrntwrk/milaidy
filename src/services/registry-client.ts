/**
 * Registry Client for Milady.
 *
 * Provides a 3-tier cached registry (memory → file → network) that works
 * offline, in .app bundles, and in dev. Fetches from the next branch.
 *
 * @module services/registry-client
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@elizaos/core";
import { loadMiladyConfig, saveMiladyConfig } from "../config/config.js";
import type { RegistryEndpoint } from "../config/types.milady.js";
import {
  LOCAL_APP_DEFAULT_SANDBOX,
  resolveAppOverride,
  sanitizeSandbox,
} from "./registry-client-app-meta.js";
import {
  isDefaultEndpoint as isDefaultEndpointForUrl,
  mergeCustomEndpoints,
  normaliseEndpointUrl,
  parseRegistryEndpointUrl,
} from "./registry-client-endpoints.js";
import {
  applyLocalWorkspaceApps,
  applyNodeModulePlugins,
} from "./registry-client-local.js";
import { fetchFromNetwork as fetchRegistryFromNetwork } from "./registry-client-network.js";
import {
  getPluginInfoFromRegistry,
  normalizePluginLookupAlias,
  scoreEntries,
  toAppEntry,
  toAppInfo,
  toPluginListItem,
  toSearchResults,
} from "./registry-client-queries.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATED_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json";
const INDEX_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/next/index.json";
const CACHE_TTL_MS = 3_600_000; // 1 hour

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegistryPluginInfo {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  git: {
    v0Branch: string | null;
    v1Branch: string | null;
    v2Branch: string | null;
  };
  supports: { v0: boolean; v1: boolean; v2: boolean };
  /** Absolute local workspace package path when discovered from filesystem. */
  localPath?: string;
  /** Set to "app" when this entry is a launchable application */
  kind?: string;
  /** App metadata — present when kind is "app" */
  appMeta?: RegistryAppMeta;
}

export interface RegistryAppViewerMeta {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
}

/** App-specific metadata from the registry. */
export interface RegistryAppMeta {
  displayName: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  minPlayers: number | null;
  maxPlayers: number | null;
  viewer?: RegistryAppViewerMeta;
}

/** App-specific info for listing and searching. */
export interface RegistryAppInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  stars: number;
  repository: string;
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  score: number;
  tags: string[];
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  repository: string;
}

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

let memoryCache: {
  plugins: Map<string, RegistryPluginInfo>;
  fetchedAt: number;
} | null = null;

interface LocalPackageAppMeta {
  displayName?: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  icon?: string | null;
  capabilities?: string[];
  minPlayers?: number | null;
  maxPlayers?: number | null;
  viewer?: RegistryAppViewerMeta;
}

interface LocalPackageElizaConfig {
  kind?: string;
  app?: LocalPackageAppMeta;
}

interface LocalPackageJson {
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string | { type?: string; url?: string };
  elizaos?: LocalPackageElizaConfig;
}

interface LocalPluginManifest {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string | { type?: string; url?: string };
  kind?: string;
  app?: LocalPackageAppMeta;
}

interface LocalAppOverride {
  displayName?: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  capabilities?: string[];
  viewer?: RegistryAppViewerMeta;
}

const LOCAL_APP_OVERRIDES: Readonly<Record<string, LocalAppOverride>> = {
  "@elizaos/app-babylon": {
    launchType: "url",
    launchUrl: "http://localhost:3000",
    viewer: {
      url: "http://localhost:3000",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-hyperscape": {
    launchType: "connect",
    launchUrl: "http://localhost:3333",
    viewer: {
      url: "http://localhost:3333",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        quality: "medium",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-hyperfy": {
    launchType: "connect",
    launchUrl: "http://localhost:3003",
    viewer: {
      url: "http://localhost:3003",
      sandbox: LOCAL_APP_DEFAULT_SANDBOX,
    },
  },
  "@elizaos/app-2004scape": {
    launchType: "connect",
    launchUrl: "http://localhost:8880",
    viewer: {
      url: "http://localhost:8880",
      embedParams: { bot: "{RS_SDK_BOT_NAME}" },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-agent-town": {
    launchType: "url",
    launchUrl: "http://localhost:5173/",
    viewer: {
      url: "http://localhost:5173/",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-dungeons": {
    launchType: "local",
    launchUrl: "http://localhost:3345",
    viewer: {
      url: "http://localhost:3345",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
};

function fallbackAppDisplayName(packageName: string): string {
  const bare = packageName.replace(/^@[^/]+\//, "");
  return bare
    .replace(/^app-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ensureFallbackApps(plugins: Map<string, RegistryPluginInfo>): void {
  // Ensure a baseline set of local apps is available even when the registry
  // cannot be fetched (offline / restricted networks). These are "wrappers"
  // that provide viewer + launch metadata; install behavior is handled by the
  // AppManager (and is skipped in test mode).
  for (const [packageName, override] of Object.entries(LOCAL_APP_OVERRIDES)) {
    const repoName = packageName.replace(/^@[^/]+\//, "");
    const gitRepo = `elizaos/${repoName}`;

    const existing = plugins.get(packageName);

    const fallbackMeta: RegistryAppMeta = {
      displayName:
        override.displayName ??
        existing?.appMeta?.displayName ??
        fallbackAppDisplayName(packageName),
      category: override.category ?? existing?.appMeta?.category ?? "game",
      launchType:
        override.launchType ??
        existing?.appMeta?.launchType ??
        (override.viewer ? "connect" : "url"),
      launchUrl: override.launchUrl ?? existing?.appMeta?.launchUrl ?? null,
      capabilities:
        override.capabilities ?? existing?.appMeta?.capabilities ?? [],
      viewer: mergeViewer(existing?.appMeta?.viewer, override.viewer),
    };

    plugins.set(packageName, {
      ...(existing ?? {}),
      name: packageName,
      gitRepo: existing?.gitRepo ?? gitRepo,
      gitUrl: existing?.gitUrl ?? `https://github.com/${gitRepo}.git`,
      description: existing?.description ?? "",
      homepage: existing?.homepage ?? override.launchUrl ?? null,
      topics: existing?.topics ?? [],
      stars: existing?.stars ?? 0,
      language: existing?.language ?? "TypeScript",
      npm: existing?.npm ?? {
        package: packageName,
        v0Version: null,
        v1Version: null,
        v2Version: null,
      },
      git: existing?.git ?? { v0Branch: null, v1Branch: null, v2Branch: "main" },
      supports: existing?.supports ?? { v0: false, v1: false, v2: true },
      kind: "app",
      appMeta: {
        ...(existing?.appMeta ?? {}),
        ...fallbackMeta,
      },
    });
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      ordered.push(resolved);
    }
  }
  return ordered;
}

function resolveWorkspaceRoots(): string[] {
  const envRoot =
    process.env.MILAIDY_WORKSPACE_ROOT?.trim() ||
    process.env.MILADY_WORKSPACE_ROOT?.trim();
  if (envRoot) return uniquePaths([envRoot]);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, "..", "..");
  const cwd = process.cwd();
  const roots = [
    packageRoot,
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return uniquePaths(roots);
}

function repoString(
  repo: LocalPackageJson["repository"] | LocalPluginManifest["repository"],
): string | null {
  if (!repo) return null;
  if (typeof repo === "string") return repo;
  if (typeof repo.url === "string" && repo.url.length > 0) return repo.url;
  return null;
}

function normaliseGitHubRepo(repo: string | null): string | null {
  if (!repo) return null;
  const cleaned = repo
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .trim();
  if (!cleaned.includes("/")) return null;
  return cleaned;
}

function mergeViewer(
  base: RegistryAppViewerMeta | undefined,
  patch: RegistryAppViewerMeta | undefined,
): RegistryAppViewerMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    embedParams: {
      ...(base.embedParams ?? {}),
      ...(patch.embedParams ?? {}),
    },
  };
}

function mergeAppMeta(
  base: RegistryAppMeta | undefined,
  patch: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    capabilities:
      patch.capabilities.length > 0 ? patch.capabilities : base.capabilities,
    viewer: mergeViewer(base.viewer, patch.viewer),
  };
}

function resolveStateDir(): string {
  const explicit =
    process.env.MILAIDY_STATE_DIR?.trim() ||
    process.env.MILADY_STATE_DIR?.trim();
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  return path.join(os.homedir(), ".milaidy");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toLocalAppMeta(
  app: LocalPackageAppMeta | undefined,
  fallbackDisplayName: string,
): RegistryAppMeta | undefined {
  if (!app) return undefined;
  const launchType = app.launchType ?? "url";
  return {
    displayName: app.displayName ?? fallbackDisplayName,
    category: app.category ?? "game",
    launchType,
    launchUrl: app.launchUrl ?? null,
    icon: app.icon ?? null,
    capabilities: app.capabilities ?? [],
    minPlayers: app.minPlayers ?? null,
    maxPlayers: app.maxPlayers ?? null,
    viewer: app.viewer,
  };
}

function toDisplayNameFromDirName(dirName: string): string {
  return dirName
    .replace(/^app-/, "")
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseRepositoryMetadata(
  repository:
    | LocalPackageJson["repository"]
    | LocalPluginManifest["repository"]
    | undefined,
): { gitRepo: string; gitUrl: string } {
  const repoValue = repoString(repository);
  const gitRepo = normaliseGitHubRepo(repoValue) ?? "local/workspace";
  return {
    gitRepo,
    gitUrl: `https://github.com/${gitRepo}.git`,
  };
}

function resolveAppOverride(
  packageName: string,
  appMeta: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  const override = LOCAL_APP_OVERRIDES[packageName];
  if (!override) return appMeta;
  const base: RegistryAppMeta = appMeta ?? {
    displayName:
      override.displayName ?? packageName.replace(/^@elizaos\/app-/, ""),
    category: override.category ?? "game",
    launchType: override.launchType ?? "url",
    launchUrl: override.launchUrl ?? null,
    icon: null,
    capabilities: override.capabilities ?? [],
    minPlayers: null,
    maxPlayers: null,
    viewer: override.viewer,
  };
  return {
    ...base,
    displayName: override.displayName ?? base.displayName,
    category: override.category ?? base.category,
    launchType: override.launchType ?? base.launchType,
    launchUrl:
      override.launchUrl !== undefined ? override.launchUrl : base.launchUrl,
    capabilities:
      override.capabilities !== undefined
        ? override.capabilities
        : base.capabilities,
    viewer: mergeViewer(base.viewer, override.viewer),
  };
}

function buildDiscoveredEntry(
  packageDir: string,
  dirName: string,
  packageJson: LocalPackageJson,
  manifest: LocalPluginManifest | null,
): RegistryPluginInfo | null {
  if (!packageJson?.name || packageJson.name.length === 0) return null;

  const packageAppMeta = toLocalAppMeta(
    packageJson.elizaos?.app,
    toDisplayNameFromDirName(dirName),
  );
  const manifestAppMeta = toLocalAppMeta(
    manifest?.app,
    toDisplayNameFromDirName(dirName),
  );
  const mergedMeta = mergeAppMeta(manifestAppMeta, packageAppMeta);
  const overriddenMeta = resolveAppOverride(packageJson.name, mergedMeta);

  const kind =
    packageJson.elizaos?.kind === "app" || manifest?.kind === "app"
      ? "app"
      : overriddenMeta
        ? "app"
        : undefined;

  const repo = parseRepositoryMetadata(
    packageJson.repository ?? manifest?.repository,
  );
  const description = packageJson.description ?? manifest?.description ?? "";
  const homepage =
    packageJson.homepage ??
    manifest?.homepage ??
    overriddenMeta?.launchUrl ??
    null;
  const version = packageJson.version ?? manifest?.version ?? null;

  return {
    name: packageJson.name,
    gitRepo: repo.gitRepo,
    gitUrl: repo.gitUrl,
    description,
    homepage,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: packageJson.name,
      v0Version: null,
      v1Version: null,
      v2Version: version,
    },
    git: {
      v0Branch: null,
      v1Branch: null,
      v2Branch: "main",
    },
    supports: { v0: false, v1: false, v2: true },
    localPath: packageDir,
    kind,
    appMeta: overriddenMeta ?? undefined,
  };
}

async function discoverLocalWorkspaceApps(): Promise<
  Map<string, RegistryPluginInfo>
> {
  const discovered = new Map<string, RegistryPluginInfo>();

  // 1. Scan workspace plugins/ directories for app-* folders
  for (const workspaceRoot of resolveWorkspaceRoots()) {
    const pluginsDir = path.join(workspaceRoot, "plugins");
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (
        (!entry.isDirectory() && !entry.isSymbolicLink()) ||
        !entry.name.startsWith("app-")
      )
        continue;
      const packageDir = path.join(pluginsDir, entry.name);
      const packageJson = await readJsonFile<LocalPackageJson>(
        path.join(packageDir, "package.json"),
      );
      if (!packageJson) continue;

      const manifest = await readJsonFile<LocalPluginManifest>(
        path.join(packageDir, "elizaos.plugin.json"),
      );
      const info = buildDiscoveredEntry(
        packageDir,
        entry.name,
        packageJson,
        manifest,
      );
      if (info) discovered.set(info.name, info);
    }
  }

  // 2. Scan user-installed plugins (~/.milaidy/plugins/installed/) for kind: "app"
  const stateDir = resolveStateDir();
  const installedBase = path.join(stateDir, "plugins", "installed");
  try {
    const installedEntries = await fs.readdir(installedBase, {
      withFileTypes: true,
    });
    for (const entry of installedEntries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const installDir = path.join(installedBase, entry.name);
      // Installed plugins nest inside node_modules — find the actual package
      const nmDir = path.join(installDir, "node_modules");
      const pkgDirs: string[] = [];
      try {
        const nmEntries = await fs.readdir(nmDir, { withFileTypes: true });
        for (const nm of nmEntries) {
          if (nm.name.startsWith("@")) {
            // Scoped package — read one level deeper
            const scopeDir = path.join(nmDir, nm.name);
            try {
              const scopeEntries = await fs.readdir(scopeDir, {
                withFileTypes: true,
              });
              for (const se of scopeEntries) {
                pkgDirs.push(path.join(scopeDir, se.name));
              }
            } catch {
              /* skip */
            }
          } else if (nm.isDirectory() || nm.isSymbolicLink()) {
            pkgDirs.push(path.join(nmDir, nm.name));
          }
        }
      } catch {
        continue;
      }

      for (const pkgDir of pkgDirs) {
        const pkgJson = await readJsonFile<LocalPackageJson>(
          path.join(pkgDir, "package.json"),
        );
        if (!pkgJson?.name) continue;
        // Only include if this is an app-kind plugin
        if (pkgJson.elizaos?.kind !== "app") continue;
        // Skip if already discovered from workspace
        if (discovered.has(pkgJson.name)) continue;

        const manifest = await readJsonFile<LocalPluginManifest>(
          path.join(pkgDir, "elizaos.plugin.json"),
        );
        const dirName = pkgJson.name
          .replace(/^@[^/]+\//, "")
          .replace(/^plugin-/, "app-");
        const info = buildDiscoveredEntry(pkgDir, dirName, pkgJson, manifest);
        if (info) discovered.set(info.name, info);
      }
    }
  } catch {
    // installed dir may not exist
  }

  return discovered;
}

async function applyLocalWorkspaceApps(
  plugins: Map<string, RegistryPluginInfo>,
): Promise<void> {
  const localApps = await discoverLocalWorkspaceApps();
  if (localApps.size === 0) return;

  for (const [name, localInfo] of localApps.entries()) {
    const existing = plugins.get(name);
    if (!existing) {
      plugins.set(name, localInfo);
      continue;
    }

    plugins.set(name, {
      ...existing,
      localPath: localInfo.localPath,
      kind: localInfo.kind ?? existing.kind,
      appMeta: mergeAppMeta(existing.appMeta, localInfo.appMeta),
      description: localInfo.description || existing.description,
      homepage: localInfo.homepage ?? existing.homepage,
      npm: {
        ...existing.npm,
        package: existing.npm.package || localInfo.npm.package,
        v2Version: existing.npm.v2Version ?? localInfo.npm.v2Version,
      },
      git: {
        v0Branch: existing.git.v0Branch ?? localInfo.git.v0Branch,
        v1Branch: existing.git.v1Branch ?? localInfo.git.v1Branch,
        v2Branch: existing.git.v2Branch ?? localInfo.git.v2Branch,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Network fetch + parse (inlined wire types — not exported)
// ---------------------------------------------------------------------------

async function fetchFromNetwork(): Promise<Map<string, RegistryPluginInfo>> {
  try {
    return await fetchRegistryFromNetwork({
      generatedRegistryUrl: GENERATED_REGISTRY_URL,
      indexRegistryUrl: INDEX_REGISTRY_URL,
      applyLocalWorkspaceApps,
      applyNodeModulePlugins,
      sanitizeSandbox,
    });
  } catch (err) {
    logger.warn(
      `[registry-client] generated-registry/index fallback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// File cache
// ---------------------------------------------------------------------------

function cacheFilePath(): string {
  return path.join(resolveStateDir(), "cache", "registry.json");
}

async function readFileCache(): Promise<Map<
  string,
  RegistryPluginInfo
> | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as {
      fetchedAt: number;
      plugins: Array<[string, RegistryPluginInfo]>;
    };
    if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.plugins))
      return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return new Map(parsed.plugins);
  } catch {
    return null;
  }
}

async function writeFileCache(
  plugins: Map<string, RegistryPluginInfo>,
): Promise<void> {
  const filePath = cacheFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ fetchedAt: Date.now(), plugins: [...plugins.entries()] }),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Multi-endpoint management
// ---------------------------------------------------------------------------

/** Return the list of custom registry endpoints from config. */
export function getConfiguredEndpoints(): RegistryEndpoint[] {
  try {
    const cfg = loadMiladyConfig();
    return cfg.plugins?.registryEndpoints ?? [];
  } catch {
    return [];
  }
}

/** Add a custom registry endpoint. Blocks duplicate URLs. */
export function addRegistryEndpoint(label: string, url: string): void {
  const parsed = parseRegistryEndpointUrl(url);
  const normalised = normaliseEndpointUrl(parsed.toString());
  if (isDefaultEndpoint(normalised)) {
    throw new Error("Cannot add the default registry as a custom endpoint.");
  }
  const cfg = loadMiladyConfig();
  const endpoints = cfg.plugins?.registryEndpoints ?? [];
  if (endpoints.some((ep) => normaliseEndpointUrl(ep.url) === normalised)) {
    throw new Error(`Endpoint already exists: ${url}`);
  }
  if (!cfg.plugins) cfg.plugins = {};
  cfg.plugins.registryEndpoints = [
    ...endpoints,
    { label, url: normalised, enabled: true },
  ];
  saveMiladyConfig(cfg);
  memoryCache = null;
}

/** Remove a custom registry endpoint by URL. Cannot remove the default. */
export function removeRegistryEndpoint(url: string): void {
  const normalised = normaliseEndpointUrl(url);
  if (isDefaultEndpoint(normalised)) {
    throw new Error("Cannot remove the default ElizaOS registry.");
  }
  const cfg = loadMiladyConfig();
  const endpoints = cfg.plugins?.registryEndpoints ?? [];
  const updated = endpoints.filter(
    (ep) => normaliseEndpointUrl(ep.url) !== normalised,
  );
  if (updated.length === endpoints.length) {
    throw new Error(`Endpoint not found: ${url}`);
  }
  if (!cfg.plugins) cfg.plugins = {};
  cfg.plugins.registryEndpoints = updated;
  saveMiladyConfig(cfg);
  memoryCache = null;
}

/** Toggle an endpoint's enabled status. */
export function toggleRegistryEndpoint(url: string, enabled: boolean): void {
  const normalised = normaliseEndpointUrl(url);
  const cfg = loadMiladyConfig();
  const endpoints = cfg.plugins?.registryEndpoints ?? [];
  const ep = endpoints.find((e) => normaliseEndpointUrl(e.url) === normalised);
  if (!ep) throw new Error(`Endpoint not found: ${url}`);
  ep.enabled = enabled;
  if (!cfg.plugins) cfg.plugins = {};
  cfg.plugins.registryEndpoints = endpoints;
  saveMiladyConfig(cfg);
  memoryCache = null;
}

export function isDefaultEndpoint(url: string): boolean {
  return isDefaultEndpointForUrl(url, GENERATED_REGISTRY_URL);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all plugins. Resolution: memory → file → network. */
export async function getRegistryPlugins(): Promise<
  Map<string, RegistryPluginInfo>
> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    ensureFallbackApps(memoryCache.plugins);
    return memoryCache.plugins;
  }

  const fromFile = await readFileCache();
  if (fromFile) {
    await applyLocalWorkspaceApps(fromFile);
    ensureFallbackApps(fromFile);
    memoryCache = { plugins: fromFile, fetchedAt: Date.now() };
    return fromFile;
  }

  logger.info("[registry-client] Fetching plugin registry from next branch...");
  const plugins = await fetchFromNetwork();
  await mergeCustomEndpoints(plugins, getConfiguredEndpoints());
  logger.info(`[registry-client] Loaded ${plugins.size} plugins`);

  ensureFallbackApps(plugins);
  memoryCache = { plugins, fetchedAt: Date.now() };
  writeFileCache(plugins).catch((err) =>
    logger.warn(
      `[registry-client] Cache write failed: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );

  return plugins;
}

/** Force-refresh from network. */
export async function refreshRegistry(): Promise<
  Map<string, RegistryPluginInfo>
> {
  memoryCache = null;
  try {
    await fs.unlink(cacheFilePath());
  } catch {
    /* noop */
  }
  return getRegistryPlugins();
}

/** Look up a plugin by name (exact → @elizaos/ prefix → bare suffix). */
export async function getPluginInfo(
  name: string,
): Promise<RegistryPluginInfo | null> {
  const registry = await getRegistryPlugins();
  const normalizedName = normalizePluginLookupAlias(name);
  const candidates = Array.from(new Set([normalizedName, name]));

  for (const candidate of candidates) {
    const info = getPluginInfoFromRegistry(registry, candidate);
    if (info) return info;
  }

  return null;
}

/** Search plugins by query (local fuzzy match on name/description/topics). */
export async function searchPlugins(
  query: string,
  limit = 15,
): Promise<RegistrySearchResult[]> {
  const registry = await getRegistryPlugins();
  const results = scoreEntries(registry.values(), query, limit);
  return toSearchResults(results);
}

/** List all registered apps. */
export async function listApps(): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const apps: RegistryAppInfo[] = [];

  for (const p of registry.values()) {
    const appEntry = toAppEntry(p, resolveAppOverride);
    if (!appEntry) continue;
    apps.push(toAppInfo(appEntry, sanitizeSandbox, LOCAL_APP_DEFAULT_SANDBOX));
  }

  apps.sort((a, b) => b.stars - a.stars);
  return apps;
}

/** Look up a specific app by name. */
export async function getAppInfo(
  name: string,
): Promise<RegistryAppInfo | null> {
  const info = await getPluginInfo(name);
  if (!info) return null;
  const appEntry = toAppEntry(info, resolveAppOverride);
  if (!appEntry) return null;
  return toAppInfo(appEntry, sanitizeSandbox, LOCAL_APP_DEFAULT_SANDBOX);
}

/** Search apps by query. */
export async function searchApps(
  query: string,
  limit = 15,
): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const appEntries: RegistryPluginInfo[] = [];
  for (const p of registry.values()) {
    const appEntry = toAppEntry(p, resolveAppOverride);
    if (appEntry) appEntries.push(appEntry);
  }

  const results = scoreEntries(
    appEntries,
    query,
    limit,
    (p) => [p.appMeta?.displayName?.toLowerCase() ?? ""],
    (p) => p.appMeta?.capabilities ?? [],
  );

  return results.map(({ p }) =>
    toAppInfo(p, sanitizeSandbox, LOCAL_APP_DEFAULT_SANDBOX),
  );
}

/** Slim plugin info returned by listNonAppPlugins / searchNonAppPlugins. */
export interface RegistryPluginListItem {
  name: string;
  description: string;
  stars: number;
  repository: string;
  topics: string[];
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
}

/** List all non-app plugins from the registry. */
export async function listNonAppPlugins(): Promise<RegistryPluginListItem[]> {
  const registry = await getRegistryPlugins();
  const plugins: RegistryPluginListItem[] = [];

  for (const p of registry.values()) {
    if (p.kind !== "app") {
      plugins.push(toPluginListItem(p));
    }
  }

  plugins.sort((a, b) => b.stars - a.stars);
  return plugins;
}

/** Search non-app plugins by query. */
export async function searchNonAppPlugins(
  query: string,
  limit = 15,
): Promise<RegistryPluginListItem[]> {
  const registry = await getRegistryPlugins();
  const pluginEntries = [...registry.values()].filter((p) => p.kind !== "app");

  const results = scoreEntries(pluginEntries, query, limit);
  return results.map(({ p }) => toPluginListItem(p));
}
