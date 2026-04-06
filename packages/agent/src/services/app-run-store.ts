import * as fs from "node:fs";
import path from "node:path";
import type { AppRunSummary } from "../contracts/apps";
import { resolveStateDir } from "../config/paths";

const APP_RUN_STORE_VERSION = 1;

interface AppRunStoreFile {
  version: number;
  updatedAt: string;
  runs: AppRunSummary[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStoreFile(): AppRunStoreFile {
  return {
    version: APP_RUN_STORE_VERSION,
    updatedAt: nowIso(),
    runs: [],
  };
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function atomicWrite(filePath: string, payload: AppRunStoreFile): void {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    fs.renameSync(tmpPath, filePath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
  }
}

function normalizeRun(input: unknown): AppRunSummary | null {
  if (!input || typeof input !== "object") return null;
  const run = input as Record<string, unknown>;
  if (
    typeof run.runId !== "string" ||
    typeof run.appName !== "string" ||
    typeof run.displayName !== "string" ||
    typeof run.pluginName !== "string" ||
    typeof run.launchType !== "string" ||
    typeof run.status !== "string" ||
    typeof run.startedAt !== "string" ||
    typeof run.updatedAt !== "string" ||
    typeof run.supportsBackground !== "boolean" ||
    typeof run.viewerAttachment !== "string" ||
    !run.health ||
    typeof run.health !== "object"
  ) {
    return null;
  }

  const health = run.health as Record<string, unknown>;
  if (typeof health.state !== "string") {
    return null;
  }

  return {
    runId: run.runId,
    appName: run.appName,
    displayName: run.displayName,
    pluginName: run.pluginName,
    launchType: run.launchType,
    launchUrl: typeof run.launchUrl === "string" ? run.launchUrl : null,
    viewer:
      run.viewer && typeof run.viewer === "object"
        ? (run.viewer as AppRunSummary["viewer"])
        : null,
    session:
      run.session && typeof run.session === "object"
        ? (run.session as AppRunSummary["session"])
        : null,
    status: run.status,
    summary: typeof run.summary === "string" ? run.summary : null,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    lastHeartbeatAt:
      typeof run.lastHeartbeatAt === "string" ? run.lastHeartbeatAt : null,
    supportsBackground: run.supportsBackground,
    viewerAttachment:
      run.viewerAttachment === "attached" ||
      run.viewerAttachment === "detached" ||
      run.viewerAttachment === "unavailable"
        ? run.viewerAttachment
        : "detached",
    health: {
      state:
        health.state === "healthy" ||
        health.state === "degraded" ||
        health.state === "offline"
          ? health.state
          : "offline",
      message: typeof health.message === "string" ? health.message : null,
    },
  };
}

export function resolveAppRunStoreFilePath(
  stateDir: string = resolveStateDir(),
): string {
  return path.join(stateDir, "apps", "runs.v1.json");
}

export function readAppRunStore(
  stateDir: string = resolveStateDir(),
): AppRunSummary[] {
  const filePath = resolveAppRunStoreFilePath(stateDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
    return rawRuns
      .map((run) => normalizeRun(run))
      .filter((run): run is AppRunSummary => run !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    const corruptPath = `${filePath}.corrupt-${Date.now()}.json`;
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, corruptPath);
    }
    return [];
  }
}

export function writeAppRunStore(
  runs: AppRunSummary[],
  stateDir: string = resolveStateDir(),
): AppRunSummary[] {
  const filePath = resolveAppRunStoreFilePath(stateDir);
  const normalizedRuns = [...runs].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  atomicWrite(filePath, {
    version: APP_RUN_STORE_VERSION,
    updatedAt: nowIso(),
    runs: normalizedRuns,
  });
  return normalizedRuns;
}
