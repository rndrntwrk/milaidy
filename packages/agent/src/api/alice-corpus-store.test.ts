import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAliceCorpusManifest } from "./alice-corpus-manifest";
import {
  computeAliceCorpusSha,
  readLatestAliceCorpusStoreSnapshot,
  writeAliceCorpusStoreSnapshot,
} from "./alice-corpus-store";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-corpus-store-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("alice corpus durable store", () => {
  it("writes content-addressed objects and a latest snapshot pointer", () => {
    const root = makeTempDir();
    const storeDir = makeTempDir();
    writeFile(root, "README.md", "# Alice\n");
    writeFile(root, "docs/runbook.md", "# Runbook\n");

    const manifest = buildAliceCorpusManifest({
      roots: [{ id: "milaidy", path: root }],
      generatedAt: "2026-05-02T12:00:00.000Z",
    });

    const result = writeAliceCorpusStoreSnapshot({
      storeDir,
      manifest,
      storedAt: "2026-05-02T12:01:00.000Z",
    });

    expect(result.snapshot).toMatchObject({
      version: 1,
      snapshotId: computeAliceCorpusSha(manifest).slice(0, 32),
      corpusSha: computeAliceCorpusSha(manifest),
      items: [
        {
          relativePath: "README.md",
          objectPath: expect.stringMatching(/^objects\/sha256\//),
        },
        {
          relativePath: "docs/runbook.md",
          objectPath: expect.stringMatching(/^objects\/sha256\//),
        },
      ],
    });
    expect(result.objectCount).toBe(2);
    expect(result.objectsWritten).toBe(2);
    expect(result.existingObjects).toBe(0);
    expect(fs.existsSync(result.snapshotPath)).toBe(true);
    expect(fs.existsSync(result.latestPath)).toBe(true);

    const latest = readLatestAliceCorpusStoreSnapshot(storeDir);
    expect(latest).toEqual(result.snapshot);
    for (const item of result.snapshot.items) {
      expect(fs.existsSync(path.join(storeDir, item.objectPath))).toBe(true);
      expect(item).not.toHaveProperty("absolutePath");
    }
  });

  it("dedupes repeated writes by object sha", () => {
    const root = makeTempDir();
    const storeDir = makeTempDir();
    writeFile(root, "README.md", "# Alice\n");

    const manifest = buildAliceCorpusManifest({
      roots: [{ id: "milaidy", path: root }],
      generatedAt: "2026-05-02T12:00:00.000Z",
    });

    const first = writeAliceCorpusStoreSnapshot({ storeDir, manifest });
    const second = writeAliceCorpusStoreSnapshot({ storeDir, manifest });

    expect(second.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
    expect(second.objectsWritten).toBe(0);
    expect(second.existingObjects).toBe(1);
  });

  it("fails closed if source bytes change after manifest generation", () => {
    const root = makeTempDir();
    const storeDir = makeTempDir();
    writeFile(root, "README.md", "# Alice\n");

    const manifest = buildAliceCorpusManifest({
      roots: [{ id: "milaidy", path: root }],
      generatedAt: "2026-05-02T12:00:00.000Z",
    });
    writeFile(root, "README.md", "# Changed\n");

    expect(() => writeAliceCorpusStoreSnapshot({ storeDir, manifest })).toThrow(
      /Corpus source changed while writing store/,
    );
  });
});
