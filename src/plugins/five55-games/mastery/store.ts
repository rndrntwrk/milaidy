import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveStateDir } from "../../../config/paths.js";
import type {
  Five55MasteryEpisode,
  Five55MasteryGameSnapshot,
  Five55MasteryLog,
  Five55MasteryRun,
  Five55MasteryRunsPage,
} from "./types.js";
import { canonicalizeMasteryGameId } from "./aliases.js";

const ROOT_DIR = "five55-mastery";
const RUNS_DIR = "runs";
const RUN_INDEX_FILE = "runs-index.json";
const GAME_SNAPSHOTS_FILE = "latest-by-game.json";
const RUN_SUMMARY_FILE = "summary.json";
const RUN_EPISODES_FILE = "episodes.jsonl";
const RUN_LOGS_FILE = "logs.jsonl";

type RunsIndex = {
  runIds: string[];
};

function masteryRootDir(): string {
  return path.join(resolveStateDir(process.env), ROOT_DIR);
}

function runDir(runId: string): string {
  return path.join(masteryRootDir(), RUNS_DIR, runId);
}

function runSummaryPath(runId: string): string {
  return path.join(runDir(runId), RUN_SUMMARY_FILE);
}

function runEpisodesPath(runId: string): string {
  return path.join(runDir(runId), RUN_EPISODES_FILE);
}

function runLogsPath(runId: string): string {
  return path.join(runDir(runId), RUN_LOGS_FILE);
}

function runIndexPath(): string {
  return path.join(masteryRootDir(), RUN_INDEX_FILE);
}

function gameSnapshotsPath(): string {
  return path.join(masteryRootDir(), GAME_SNAPSHOTS_FILE);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(path.join(masteryRootDir(), RUNS_DIR), { recursive: true });
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function appendJsonl(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(Math.max(0, offset)), "utf8").toString("base64url");
}

function normalizeLimit(limit: number | undefined, fallback = 20): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

async function readRunsIndex(): Promise<RunsIndex> {
  await ensureDirs();
  return readJsonFile<RunsIndex>(runIndexPath(), { runIds: [] });
}

async function writeRunsIndex(index: RunsIndex): Promise<void> {
  await writeJsonAtomic(runIndexPath(), index);
}

export async function writeMasteryRun(run: Five55MasteryRun): Promise<void> {
  await ensureDirs();
  await fs.mkdir(runDir(run.runId), { recursive: true });
  await writeJsonAtomic(runSummaryPath(run.runId), run);

  const index = await readRunsIndex();
  const deduped = [run.runId, ...index.runIds.filter((entry) => entry !== run.runId)];
  await writeRunsIndex({ runIds: deduped.slice(0, 5000) });
}

export async function readMasteryRun(runId: string): Promise<Five55MasteryRun | null> {
  await ensureDirs();
  return readJsonFile<Five55MasteryRun | null>(runSummaryPath(runId), null);
}

export async function listMasteryRuns(input?: {
  limit?: number;
  cursor?: string | null;
  status?: string;
}): Promise<Five55MasteryRunsPage> {
  await ensureDirs();
  const limit = normalizeLimit(input?.limit, 20);
  const index = await readRunsIndex();
  const allRuns: Five55MasteryRun[] = [];

  for (const runId of index.runIds) {
    const run = await readMasteryRun(runId);
    if (!run) continue;
    if (input?.status && run.status !== input.status) continue;
    allRuns.push(run);
  }

  const offset = decodeCursor(input?.cursor ?? null);
  const runs = allRuns.slice(offset, offset + limit);
  const nextOffset = offset + runs.length;
  const nextCursor = nextOffset < allRuns.length ? encodeCursor(nextOffset) : null;

  return {
    runs,
    limit,
    cursor: input?.cursor ?? null,
    nextCursor,
    total: allRuns.length,
  };
}

export async function appendMasteryEpisode(
  runId: string,
  episode: Five55MasteryEpisode,
): Promise<void> {
  await appendJsonl(runEpisodesPath(runId), episode);
}

export async function readMasteryEpisodes(runId: string): Promise<Five55MasteryEpisode[]> {
  const file = runEpisodesPath(runId);
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as Five55MasteryEpisode;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Five55MasteryEpisode => Boolean(entry));
  } catch {
    return [];
  }
}

export async function appendMasteryLog(runId: string, log: Five55MasteryLog): Promise<void> {
  await appendJsonl(runLogsPath(runId), log);
}

export async function readMasteryLogs(input: {
  runId: string;
  afterSeq?: number;
  limit?: number;
}): Promise<Five55MasteryLog[]> {
  const file = runLogsPath(input.runId);
  const afterSeq = Number.isFinite(Number(input.afterSeq))
    ? Math.max(0, Math.floor(Number(input.afterSeq)))
    : 0;
  const limit = normalizeLimit(input.limit, 500);

  try {
    const raw = await fs.readFile(file, "utf8");
    const all = raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as Five55MasteryLog;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Five55MasteryLog => Boolean(entry));

    return all.filter((entry) => entry.seq > afterSeq).slice(0, limit);
  } catch {
    return [];
  }
}

type SnapshotMap = Record<string, Five55MasteryGameSnapshot>;

async function readSnapshotMap(): Promise<SnapshotMap> {
  await ensureDirs();
  return readJsonFile<SnapshotMap>(gameSnapshotsPath(), {});
}

export async function writeMasteryGameSnapshot(
  snapshot: Five55MasteryGameSnapshot,
): Promise<void> {
  const gameId = canonicalizeMasteryGameId(snapshot.gameId);
  const map = await readSnapshotMap();
  map[gameId] = {
    ...snapshot,
    gameId,
  };
  await writeJsonAtomic(gameSnapshotsPath(), map);
}

export async function readMasteryGameSnapshot(
  gameId: string,
): Promise<Five55MasteryGameSnapshot | null> {
  const canonicalGameId = canonicalizeMasteryGameId(gameId);
  const map = await readSnapshotMap();
  return map[canonicalGameId] ?? null;
}

export async function readAllMasteryGameSnapshots(): Promise<SnapshotMap> {
  return readSnapshotMap();
}
