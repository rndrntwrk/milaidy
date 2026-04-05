import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "@elizaos/core";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import type { AppLaunchResult, AppSessionState } from "../contracts/apps";
import { getPluginInfo } from "./registry-client.js";

export interface AppLaunchSessionContext {
  appName: string;
  launchUrl: string | null;
  runtime: IAgentRuntime | null;
  viewer: AppLaunchResult["viewer"] | null;
}

export type AppLaunchSessionResolver = (
  ctx: AppLaunchSessionContext,
) => Promise<AppSessionState | null>;

export type AppRouteModule = {
  handleAppRoutes?: (ctx: unknown) => Promise<boolean>;
  resolveLaunchSession?: AppLaunchSessionResolver;
  [key: string]: unknown;
};

type AppPluginModule = {
  default?: Plugin;
  [key: string]: unknown;
};

const APP_PACKAGE_PREFIX = "@elizaos/app-";

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const candidate of paths) {
    const resolved = path.resolve(candidate);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      ordered.push(resolved);
    }
  }
  return ordered;
}

function resolveWorkspaceRoots(): string[] {
  const cwd = process.cwd();
  return uniquePaths([
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ]);
}

function packageNameToDirName(packageName: string): string {
  return packageName.replace(/^@[^/]+\//, "");
}

async function readPackageName(
  packageDir: string,
): Promise<string | null> {
  try {
    const packageJson = JSON.parse(
      await fs.promises.readFile(path.join(packageDir, "package.json"), "utf8"),
    ) as { name?: unknown };
    return typeof packageJson.name === "string" ? packageJson.name : null;
  } catch {
    return null;
  }
}

async function resolveWorkspacePackageDir(
  packageName: string,
): Promise<string | null> {
  const dirName = packageNameToDirName(packageName);
  const candidateDirs: string[] = [];

  for (const workspaceRoot of resolveWorkspaceRoots()) {
    candidateDirs.push(
      path.join(workspaceRoot, "plugins", dirName),
      path.join(workspaceRoot, "packages", dirName),
    );

    let rootEntries: fs.Dirent[] = [];
    try {
      rootEntries = await fs.promises.readdir(workspaceRoot, {
        withFileTypes: true,
      });
    } catch {
      continue;
    }

    for (const entry of rootEntries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      candidateDirs.push(
        path.join(workspaceRoot, entry.name, "plugins", dirName),
        path.join(workspaceRoot, entry.name, "packages", dirName),
      );
    }
  }

  for (const candidateDir of uniquePaths(candidateDirs)) {
    if (!fs.existsSync(path.join(candidateDir, "package.json"))) {
      continue;
    }
    const discoveredName = await readPackageName(candidateDir);
    if (discoveredName === packageName) {
      return candidateDir;
    }
  }

  return null;
}

async function importFirstExistingModule<T>(
  candidatePaths: string[],
): Promise<T | null> {
  let lastError: unknown = null;

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      return (await import(pathToFileURL(candidatePath).href)) as T;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

export function packageNameToAppSlug(packageName: string): string | null {
  if (!packageName.startsWith(APP_PACKAGE_PREFIX)) {
    return null;
  }
  const slug = packageName.slice(APP_PACKAGE_PREFIX.length).trim();
  return slug.length > 0 ? slug : null;
}

async function importLocalAppRouteModule(
  packageName: string,
): Promise<AppRouteModule | null> {
  const localInfo = await getPluginInfo(packageName);
  const localPath =
    localInfo?.localPath ?? (await resolveWorkspacePackageDir(packageName));
  if (!localPath) return null;

  const candidatePaths = [
    path.join(localPath, "src", "routes.ts"),
    path.join(localPath, "src", "routes.js"),
    path.join(localPath, "dist", "routes.js"),
  ];
  return importFirstExistingModule<AppRouteModule>(candidatePaths);
}

async function importLocalAppPluginModule(
  packageName: string,
): Promise<AppPluginModule | null> {
  const localInfo = await getPluginInfo(packageName);
  const localPath =
    localInfo?.localPath ?? (await resolveWorkspacePackageDir(packageName));
  if (!localPath) return null;

  const candidatePaths = [
    path.join(localPath, "src", "index.ts"),
    path.join(localPath, "src", "index.js"),
    path.join(localPath, "dist", "index.js"),
  ];
  return importFirstExistingModule<AppPluginModule>(candidatePaths);
}

function isPluginLike(value: unknown): value is Plugin {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function resolvePluginExport(
  module: AppPluginModule,
  packageName: string,
): Plugin | null {
  if (isPluginLike(module.default)) {
    return module.default;
  }

  for (const value of Object.values(module)) {
    if (isPluginLike(value) && value.name === packageName) {
      return value;
    }
  }

  return null;
}

export async function importAppRouteModule(
  slug: string,
): Promise<AppRouteModule | null> {
  const packageName = `${APP_PACKAGE_PREFIX}${slug}`;

  try {
    const localModule = await importLocalAppRouteModule(packageName);
    if (localModule) {
      return localModule;
    }
  } catch (err) {
    logger.warn(
      `[app-package-modules] Failed to import local routes for ${packageName}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    return (await import(
      /* webpackIgnore: true */ `${packageName}/routes`
    )) as AppRouteModule;
  } catch {
    return null;
  }
}

export async function importAppPlugin(packageName: string): Promise<Plugin | null> {
  try {
    const localModule = await importLocalAppPluginModule(packageName);
    if (localModule) {
      return resolvePluginExport(localModule, packageName);
    }
  } catch (err) {
    logger.warn(
      `[app-package-modules] Failed to import local plugin for ${packageName}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    const packageModule = (await import(
      /* webpackIgnore: true */ packageName
    )) as AppPluginModule;
    return resolvePluginExport(packageModule, packageName);
  } catch {
    return null;
  }
}
