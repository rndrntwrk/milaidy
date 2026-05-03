import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { ElizaConfig } from "../config/types.eliza.js";
import {
  type AliceCorpusRoot,
  buildAliceCorpusManifest,
} from "./alice-corpus-manifest.js";
import {
  readLatestAliceCorpusStoreSnapshot,
  writeAliceCorpusStoreSnapshot,
} from "./alice-corpus-store.js";

export interface AliceCorpusRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  config: Pick<ElizaConfig, "alice">;
  stateDir?: string;
  cwd?: string;
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
}

function resolveCorpusRoots(
  config: Pick<ElizaConfig, "alice">,
  cwd: string,
): AliceCorpusRoot[] {
  const configuredRoots = config.alice?.corpus?.roots;
  if (Array.isArray(configuredRoots) && configuredRoots.length > 0) {
    return configuredRoots
      .filter(
        (root): root is { id: string; path: string } =>
          typeof root.id === "string" && typeof root.path === "string",
      )
      .map((root) => ({
        id: root.id,
        path: path.resolve(cwd, root.path),
      }));
  }

  return [{ id: "runtime", path: cwd }];
}

function resolveSnapshotPath(stateDir?: string): string {
  return path.join(
    stateDir ?? resolveStateDir(),
    "alice",
    "corpus-manifest.json",
  );
}

function resolveStoreDir(
  config: Pick<ElizaConfig, "alice">,
  stateDir: string | undefined,
  cwd: string,
): string {
  const configuredStoreDir = config.alice?.corpus?.storeDir;
  if (typeof configuredStoreDir === "string" && configuredStoreDir.trim()) {
    return path.resolve(cwd, configuredStoreDir);
  }
  return path.join(stateDir ?? resolveStateDir(), "alice", "corpus-store");
}

export async function handleAliceCorpusRoutes(
  ctx: AliceCorpusRouteContext,
): Promise<boolean> {
  const {
    res,
    method,
    pathname,
    config,
    stateDir,
    cwd = process.cwd(),
    json,
    error,
  } = ctx;

  if (
    pathname !== "/api/alice/corpus/manifest" &&
    pathname !== "/api/alice/corpus/snapshot" &&
    pathname !== "/api/alice/corpus/snapshot/latest"
  ) {
    return false;
  }

  if (method === "GET" && pathname === "/api/alice/corpus/snapshot/latest") {
    const storeDir = resolveStoreDir(config, stateDir, cwd);
    const snapshot = readLatestAliceCorpusStoreSnapshot(storeDir);
    if (!snapshot) {
      error(res, "No Alice corpus snapshot has been written", 404);
      return true;
    }
    json(res, { ok: true, storeDir, snapshot });
    return true;
  }

  const manifest = buildAliceCorpusManifest({
    roots: resolveCorpusRoots(config, cwd),
  });

  if (method === "GET" && pathname === "/api/alice/corpus/manifest") {
    json(res, { ok: true, manifest });
    return true;
  }

  if (method === "POST" && pathname === "/api/alice/corpus/snapshot") {
    const snapshotPath = resolveSnapshotPath(stateDir);
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(
      snapshotPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );
    const store = writeAliceCorpusStoreSnapshot({
      storeDir: resolveStoreDir(config, stateDir, cwd),
      manifest,
    });
    json(res, {
      ok: true,
      snapshotPath,
      manifest,
      store: {
        snapshotId: store.snapshot.snapshotId,
        corpusSha: store.snapshot.corpusSha,
        snapshotPath: store.snapshotPath,
        latestPath: store.latestPath,
        objectCount: store.objectCount,
        objectsWritten: store.objectsWritten,
        existingObjects: store.existingObjects,
        bytesWritten: store.bytesWritten,
      },
    });
    return true;
  }

  error(res, "Method not allowed", 405);
  return true;
}
