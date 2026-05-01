import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { ElizaConfig } from "../config/types.eliza.js";
import {
  type AliceCorpusRoot,
  buildAliceCorpusManifest,
} from "./alice-corpus-manifest.js";

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
  return path.join(stateDir ?? resolveStateDir(), "alice", "corpus-manifest.json");
}

export async function handleAliceCorpusRoutes(
  ctx: AliceCorpusRouteContext,
): Promise<boolean> {
  const { res, method, pathname, config, stateDir, cwd = process.cwd(), json, error } = ctx;

  if (
    pathname !== "/api/alice/corpus/manifest" &&
    pathname !== "/api/alice/corpus/snapshot"
  ) {
    return false;
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
    fs.writeFileSync(snapshotPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    json(res, { ok: true, snapshotPath, manifest });
    return true;
  }

  error(res, "Method not allowed", 405);
  return true;
}
