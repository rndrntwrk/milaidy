import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AliceCorpusManifest,
  AliceCorpusManifestItem,
} from "./alice-corpus-manifest.js";

export interface AliceCorpusStoredItem {
  rootId: string;
  relativePath: string;
  contentType: AliceCorpusManifestItem["contentType"];
  sha256: string;
  byteSize: number;
  objectPath: string;
}

export interface AliceCorpusStoredSnapshot {
  version: 1;
  snapshotId: string;
  corpusSha: string;
  generatedAt: string;
  storedAt: string;
  roots: AliceCorpusManifest["roots"];
  excludedCount: number;
  items: AliceCorpusStoredItem[];
}

export interface AliceCorpusLatestPointer {
  version: 1;
  snapshotId: string;
  corpusSha: string;
  snapshotPath: string;
  storedAt: string;
}

export interface AliceCorpusStoreWriteResult {
  snapshot: AliceCorpusStoredSnapshot;
  snapshotPath: string;
  latestPath: string;
  objectCount: number;
  objectsWritten: number;
  existingObjects: number;
  bytesWritten: number;
}

export interface WriteAliceCorpusStoreOptions {
  storeDir: string;
  manifest: AliceCorpusManifest;
  storedAt?: string;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function computeAliceCorpusSha(manifest: AliceCorpusManifest): string {
  const normalized = manifest.items
    .map((item) => ({
      rootId: item.rootId,
      relativePath: item.relativePath,
      contentType: item.contentType,
      sha256: item.sha256,
      byteSize: item.byteSize,
    }))
    .sort((left, right) => {
      const leftKey = `${left.rootId}/${left.relativePath}`;
      const rightKey = `${right.rootId}/${right.relativePath}`;
      return leftKey.localeCompare(rightKey);
    });
  return sha256(Buffer.from(JSON.stringify(normalized), "utf-8"));
}

function objectRelativePath(sha: string): string {
  return path.join("objects", "sha256", sha.slice(0, 2), sha);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, stableJson(value), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function readAndVerifySource(item: AliceCorpusManifestItem): Buffer {
  const bytes = fs.readFileSync(item.absolutePath);
  const actualSha = sha256(bytes);
  if (actualSha !== item.sha256) {
    throw new Error(
      `Corpus source changed while writing store: ${item.rootId}/${item.relativePath} expected ${item.sha256} got ${actualSha}`,
    );
  }
  if (bytes.byteLength !== item.byteSize) {
    throw new Error(
      `Corpus source size changed while writing store: ${item.rootId}/${item.relativePath} expected ${item.byteSize} got ${bytes.byteLength}`,
    );
  }
  return bytes;
}

function ensureObject(
  storeDir: string,
  item: AliceCorpusManifestItem,
): {
  relativePath: string;
  written: boolean;
  byteSize: number;
} {
  const relativePath = objectRelativePath(item.sha256);
  const objectPath = path.join(storeDir, relativePath);
  if (fs.existsSync(objectPath)) {
    const existing = fs.readFileSync(objectPath);
    const existingSha = sha256(existing);
    if (existingSha !== item.sha256) {
      throw new Error(
        `Corpus object hash mismatch for ${relativePath}: expected ${item.sha256} got ${existingSha}`,
      );
    }
    return { relativePath, written: false, byteSize: existing.byteLength };
  }

  const source = readAndVerifySource(item);
  fs.mkdirSync(path.dirname(objectPath), { recursive: true });
  fs.writeFileSync(objectPath, source);
  return { relativePath, written: true, byteSize: source.byteLength };
}

export function writeAliceCorpusStoreSnapshot(
  options: WriteAliceCorpusStoreOptions,
): AliceCorpusStoreWriteResult {
  const storeDir = path.resolve(options.storeDir);
  const storedAt = options.storedAt ?? new Date().toISOString();
  const corpusSha = computeAliceCorpusSha(options.manifest);
  const snapshotId = corpusSha.slice(0, 32);
  const items: AliceCorpusStoredItem[] = [];
  let objectsWritten = 0;
  let existingObjects = 0;
  let bytesWritten = 0;

  for (const item of options.manifest.items) {
    const object = ensureObject(storeDir, item);
    if (object.written) {
      objectsWritten += 1;
      bytesWritten += object.byteSize;
    } else {
      existingObjects += 1;
    }
    items.push({
      rootId: item.rootId,
      relativePath: item.relativePath,
      contentType: item.contentType,
      sha256: item.sha256,
      byteSize: item.byteSize,
      objectPath: object.relativePath.split(path.sep).join("/"),
    });
  }

  const snapshot: AliceCorpusStoredSnapshot = {
    version: 1,
    snapshotId,
    corpusSha,
    generatedAt: options.manifest.generatedAt,
    storedAt,
    roots: options.manifest.roots,
    excludedCount: options.manifest.excludedCount,
    items,
  };

  const snapshotPath = path.join(storeDir, "snapshots", `${snapshotId}.json`);
  writeJsonAtomic(snapshotPath, snapshot);

  const latestPath = path.join(storeDir, "latest.json");
  const latest: AliceCorpusLatestPointer = {
    version: 1,
    snapshotId,
    corpusSha,
    snapshotPath: path
      .relative(storeDir, snapshotPath)
      .split(path.sep)
      .join("/"),
    storedAt,
  };
  writeJsonAtomic(latestPath, latest);

  return {
    snapshot,
    snapshotPath,
    latestPath,
    objectCount: items.length,
    objectsWritten,
    existingObjects,
    bytesWritten,
  };
}

export function readLatestAliceCorpusStoreSnapshot(
  storeDir: string,
): AliceCorpusStoredSnapshot | null {
  const resolvedStoreDir = path.resolve(storeDir);
  const latestPath = path.join(resolvedStoreDir, "latest.json");
  if (!fs.existsSync(latestPath)) return null;
  const latest = JSON.parse(
    fs.readFileSync(latestPath, "utf-8"),
  ) as AliceCorpusLatestPointer;
  const snapshotPath = path.resolve(resolvedStoreDir, latest.snapshotPath);
  if (!snapshotPath.startsWith(resolvedStoreDir + path.sep)) {
    throw new Error(
      `Invalid corpus snapshot path outside store: ${latest.snapshotPath}`,
    );
  }
  return JSON.parse(
    fs.readFileSync(snapshotPath, "utf-8"),
  ) as AliceCorpusStoredSnapshot;
}
