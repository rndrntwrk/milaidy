import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Re-export the full upstream server API.
export * from "@elizaos/autonomous/api/server";

// Override the wallet export rejection function with the hardened version
// that adds rate limiting, audit logging, and a forced confirmation delay.
import {
  ensureApiTokenForBindHost as upstreamEnsureApiTokenForBindHost,
  resolveCorsOrigin as upstreamResolveCorsOrigin,
  resolveWalletExportRejection as upstreamResolveWalletExportRejection,
  startApiServer as upstreamStartApiServer,
} from "@elizaos/autonomous/api/server";
import { createHardenedExportGuard } from "./wallet-export-guard";

const hardenedGuard = createHardenedExportGuard(
  upstreamResolveWalletExportRejection,
);

const BRAND_ENV_ALIASES = [
  ["MILADY_API_TOKEN", "ELIZA_API_TOKEN"],
  ["MILADY_API_BIND", "ELIZA_API_BIND"],
  ["MILADY_PAIRING_DISABLED", "ELIZA_PAIRING_DISABLED"],
  ["MILADY_ALLOWED_ORIGINS", "ELIZA_ALLOWED_ORIGINS"],
  ["MILADY_USE_PI_AI", "ELIZA_USE_PI_AI"],
  ["MILADY_STATE_DIR", "ELIZA_STATE_DIR"],
  ["MILADY_CONFIG_PATH", "ELIZA_CONFIG_PATH"],
] as const;

const HEADER_ALIASES = [
  ["x-milady-token", "x-eliza-token"],
  ["x-milady-export-token", "x-eliza-export-token"],
  ["x-milady-client-id", "x-eliza-client-id"],
  ["x-milady-terminal-token", "x-eliza-terminal-token"],
  ["x-milady-ui-language", "x-eliza-ui-language"],
] as const;

const PACKAGE_ROOT_NAMES = new Set(["milady", "eliza", "elizaai", "elizaos"]);
const miladyMirroredEnvKeys = new Set<string>();
const elizaMirroredEnvKeys = new Set<string>();

function syncMiladyEnvToEliza(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[miladyKey];
    if (typeof value === "string") {
      process.env[elizaKey] = value;
      elizaMirroredEnvKeys.add(elizaKey);
    } else if (elizaMirroredEnvKeys.has(elizaKey)) {
      delete process.env[elizaKey];
      elizaMirroredEnvKeys.delete(elizaKey);
    }
  }
}

function syncElizaEnvToMilady(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[elizaKey];
    if (typeof value === "string") {
      process.env[miladyKey] = value;
      miladyMirroredEnvKeys.add(miladyKey);
    } else if (miladyMirroredEnvKeys.has(miladyKey)) {
      delete process.env[miladyKey];
      miladyMirroredEnvKeys.delete(miladyKey);
    }
  }
}

function mirrorCompatHeaders(req: Pick<http.IncomingMessage, "headers">): void {
  for (const [miladyHeader, elizaHeader] of HEADER_ALIASES) {
    const miladyValue = req.headers[miladyHeader];
    const elizaValue = req.headers[elizaHeader];

    if (miladyValue != null && elizaValue == null) {
      req.headers[elizaHeader] = miladyValue;
    }

    if (elizaValue != null && miladyValue == null) {
      req.headers[miladyHeader] = elizaValue;
    }
  }
}

function resolveCompatConfigPaths(): {
  elizaConfigPath?: string;
  miladyConfigPath?: string;
} {
  const sharedStateDir =
    process.env.MILADY_STATE_DIR?.trim() || process.env.ELIZA_STATE_DIR?.trim();
  const miladyConfigPath =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "milady.json") : undefined);
  const elizaConfigPath =
    process.env.ELIZA_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "eliza.json") : undefined);

  return { elizaConfigPath, miladyConfigPath };
}

function syncCompatConfigFiles(): void {
  const { elizaConfigPath, miladyConfigPath } = resolveCompatConfigPaths();
  if (
    !elizaConfigPath ||
    !miladyConfigPath ||
    elizaConfigPath === miladyConfigPath
  ) {
    return;
  }

  const sourcePath = fs.existsSync(elizaConfigPath)
    ? elizaConfigPath
    : fs.existsSync(miladyConfigPath)
      ? miladyConfigPath
      : undefined;

  if (!sourcePath) {
    return;
  }

  const targetPath =
    sourcePath === elizaConfigPath ? miladyConfigPath : elizaConfigPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function patchHttpCreateServerForMiladyCompat(): () => void {
  const originalCreateServer = http.createServer.bind(http);

  http.createServer = ((...args: Parameters<typeof originalCreateServer>) => {
    const [firstArg, secondArg] = args;
    const listener =
      typeof firstArg === "function"
        ? firstArg
        : typeof secondArg === "function"
          ? secondArg
          : undefined;

    if (!listener) {
      return originalCreateServer(...args);
    }

    const wrappedListener: http.RequestListener = (req, res) => {
      syncMiladyEnvToEliza();
      syncElizaEnvToMilady();
      mirrorCompatHeaders(req);

      res.on("finish", () => {
        syncElizaEnvToMilady();
        syncCompatConfigFiles();
      });

      listener(req, res);
    };

    if (typeof firstArg === "function") {
      return originalCreateServer(wrappedListener);
    }

    return originalCreateServer(firstArg, wrappedListener);
  }) as typeof http.createServer;

  return () => {
    http.createServer = originalCreateServer as typeof http.createServer;
  };
}

/**
 * Hardened wallet export rejection function.
 *
 * Wraps the upstream token validation with per-IP rate limiting (1 per 10 min),
 * audit logging (IP + UA), and a 10s confirmation delay via single-use nonces.
 */
export function resolveWalletExportRejection(
  ...args: Parameters<typeof upstreamResolveWalletExportRejection>
): { status: number; reason: string } | null {
  return hardenedGuard(...args);
}

export function findOwnPackageRoot(startDir: string): string {
  let dir = startDir;

  for (let i = 0; i < 10; i += 1) {
    const packageJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          name?: unknown;
        };
        const packageName =
          typeof pkg.name === "string" ? pkg.name.toLowerCase() : "";

        if (PACKAGE_ROOT_NAMES.has(packageName)) {
          return dir;
        }

        if (fs.existsSync(path.join(dir, "plugins.json"))) {
          return dir;
        }
      } catch {
        // Keep walking upward until we find a readable package root.
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return startDir;
}

export function ensureApiTokenForBindHost(
  ...args: Parameters<typeof upstreamEnsureApiTokenForBindHost>
): ReturnType<typeof upstreamEnsureApiTokenForBindHost> {
  syncMiladyEnvToEliza();
  const result = upstreamEnsureApiTokenForBindHost(...args);
  syncElizaEnvToMilady();
  return result;
}

export function resolveCorsOrigin(
  ...args: Parameters<typeof upstreamResolveCorsOrigin>
): ReturnType<typeof upstreamResolveCorsOrigin> {
  syncMiladyEnvToEliza();
  const result = upstreamResolveCorsOrigin(...args);
  syncElizaEnvToMilady();
  return result;
}

export async function startApiServer(
  ...args: Parameters<typeof upstreamStartApiServer>
): Promise<Awaited<ReturnType<typeof upstreamStartApiServer>>> {
  syncMiladyEnvToEliza();
  syncElizaEnvToMilady();
  const restoreCreateServer = patchHttpCreateServerForMiladyCompat();

  try {
    const server = await upstreamStartApiServer(...args);
    syncElizaEnvToMilady();
    syncCompatConfigFiles();
    return server;
  } finally {
    restoreCreateServer();
  }
}

/**
 * Build the Authorization header value to use when forwarding requests to
 * Hyperscape. Returns `null` when no token is configured.
 *
 * - When `HYPERSCAPE_AUTH_TOKEN` is set, its value is used (prefixed with
 *   "Bearer " if not already present) regardless of any incoming header.
 * - When the env var is unset, returns `null` so callers know not to forward
 *   any credentials.
 */
export function resolveHyperscapeAuthorizationHeader(
  _req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const token = process.env.HYPERSCAPE_AUTH_TOKEN;
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}
