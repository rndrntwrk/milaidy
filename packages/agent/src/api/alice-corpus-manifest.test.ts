import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAliceCorpusManifest } from "./alice-corpus-manifest";

const tempDirs: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-corpus-"));
  tempDirs.push(root);
  return root;
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

describe("buildAliceCorpusManifest", () => {
  it("indexes current code and docs with stable hashes", () => {
    const root = makeRoot();
    writeFile(root, "packages/agent/src/api/server.ts", "export const api = true;\n");
    writeFile(root, "docs/runbook.md", "# Runbook\n");
    writeFile(root, "README.md", "# Repo\n");

    const manifest = buildAliceCorpusManifest({
      roots: [{ id: "milaidy", path: root }],
      generatedAt: "2026-05-01T12:00:00.000Z",
    });

    expect(manifest).toMatchObject({
      version: 1,
      generatedAt: "2026-05-01T12:00:00.000Z",
      roots: [{ id: "milaidy", path: root }],
    });
    expect(manifest.items.map((item) => item.relativePath)).toEqual([
      "README.md",
      "docs/runbook.md",
      "packages/agent/src/api/server.ts",
    ]);
    expect(manifest.items[0]).toMatchObject({
      rootId: "milaidy",
      contentType: "markdown",
      byteSize: 7,
    });
    expect(manifest.items[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes secrets, generated artifacts, binaries, and old backup payloads", () => {
    const root = makeRoot();
    writeFile(root, "src/index.ts", "export const safe = true;\n");
    writeFile(root, ".env", "OPENAI_API_KEY=sk-secret\n");
    writeFile(root, "secrets/prod.json", "{\"token\":\"ghp_secret\"}");
    writeFile(root, "dist/bundle.js", "compiled");
    writeFile(root, "node_modules/pkg/index.js", "dependency");
    writeFile(root, "backup/alice.env", "legacy secret");
    writeFile(root, "avatars/alice.vrm", "binary-ish");

    const manifest = buildAliceCorpusManifest({
      roots: [{ id: "milaidy", path: root }],
      generatedAt: "2026-05-01T12:00:00.000Z",
    });

    expect(manifest.items.map((item) => item.relativePath)).toEqual([
      "src/index.ts",
    ]);
    expect(manifest.excludedCount).toBe(6);
  });
});
