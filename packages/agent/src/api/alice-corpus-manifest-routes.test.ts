import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleAliceCorpusRoutes } from "./alice-corpus-routes";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-corpus-routes-"));
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

function makeContext({
  method,
  pathname,
  repoRoot,
  stateDir,
}: {
  method: string;
  pathname: string;
  repoRoot: string;
  stateDir: string;
}) {
  const jsonCalls: Array<{ data: unknown; status?: number }> = [];
  const errorCalls: Array<{ message: string; status?: number }> = [];
  return {
    ctx: {
      req: {} as never,
      res: {} as never,
      method,
      pathname,
      url: new URL(`http://localhost${pathname}`),
      stateDir,
      config: {
        alice: {
          corpus: {
            roots: [{ id: "milaidy", path: repoRoot }],
          },
        },
      },
      json: (_res: unknown, data: unknown, status?: number) => {
        jsonCalls.push({ data, status });
      },
      error: (_res: unknown, message: string, status?: number) => {
        errorCalls.push({ message, status });
      },
    },
    jsonCalls,
    errorCalls,
  };
}

describe("handleAliceCorpusRoutes", () => {
  it("builds a configured corpus manifest without secrets or backups", async () => {
    const repoRoot = makeTempDir();
    const stateDir = makeTempDir();
    writeFile(repoRoot, "packages/agent/src/api/server.ts", "export const api = true;\n");
    writeFile(repoRoot, ".env.production", "OPENAI_API_KEY=sk-secret\n");
    writeFile(repoRoot, "backup/old-config.json", "{\"token\":\"ghp_secret\"}");

    const { ctx, jsonCalls } = makeContext({
      method: "GET",
      pathname: "/api/alice/corpus/manifest",
      repoRoot,
      stateDir,
    });

    await expect(handleAliceCorpusRoutes(ctx)).resolves.toBe(true);

    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      manifest: {
        roots: [{ id: "milaidy", path: repoRoot }],
        items: [{ relativePath: "packages/agent/src/api/server.ts" }],
        excludedCount: 2,
      },
    });
  });

  it("persists corpus snapshots in the Alice state directory", async () => {
    const repoRoot = makeTempDir();
    const stateDir = makeTempDir();
    writeFile(repoRoot, "README.md", "# Alice\n");

    const { ctx, jsonCalls } = makeContext({
      method: "POST",
      pathname: "/api/alice/corpus/snapshot",
      repoRoot,
      stateDir,
    });

    await handleAliceCorpusRoutes(ctx);

    const snapshotPath = path.join(stateDir, "alice", "corpus-manifest.json");
    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      snapshotPath,
      manifest: {
        items: [{ relativePath: "README.md" }],
      },
    });
    expect(JSON.parse(fs.readFileSync(snapshotPath, "utf-8"))).toMatchObject({
      version: 1,
      items: [{ relativePath: "README.md" }],
    });
  });
});
