import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface AliceCorpusRoot {
  id: string;
  path: string;
}

export interface AliceCorpusManifestItem {
  rootId: string;
  relativePath: string;
  absolutePath: string;
  contentType: "code" | "config" | "markdown" | "text";
  sha256: string;
  byteSize: number;
}

export interface AliceCorpusManifest {
  version: 1;
  generatedAt: string;
  roots: AliceCorpusRoot[];
  items: AliceCorpusManifestItem[];
  excludedCount: number;
}

export interface BuildAliceCorpusManifestOptions {
  roots: AliceCorpusRoot[];
  generatedAt?: string;
}

const EXCLUDED_DIR_NAMES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "backup",
  "backups",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "secrets",
  "tmp",
  "temp",
]);

const EXCLUDED_EXACT_FILENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.staging",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".aac",
  ".avi",
  ".bin",
  ".dylib",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".key",
  ".mov",
  ".mp3",
  ".mp4",
  ".p12",
  ".pem",
  ".png",
  ".so",
  ".tar",
  ".vrm",
  ".wav",
  ".webm",
  ".webp",
  ".zip",
]);

const INCLUDED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".sh",
  ".sql",
  ".tf",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const INCLUDED_FILENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "README",
  "AGENTS",
  "BOOTSTRAP",
  "HEARTBEAT",
  "IDENTITY",
  "TOOLS",
  "USER",
]);

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function shouldExclude(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  if (segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment))) {
    return true;
  }
  const base = segments.at(-1) ?? "";
  if (EXCLUDED_EXACT_FILENAMES.has(base)) return true;
  if (base.startsWith(".env.")) return true;
  if (/secret|credential|token|private-key/i.test(normalized)) return true;
  const ext = path.extname(base);
  return EXCLUDED_EXTENSIONS.has(ext);
}

function shouldInclude(relativePath: string): boolean {
  const base = path.basename(relativePath);
  if (INCLUDED_FILENAMES.has(base)) return true;
  return INCLUDED_EXTENSIONS.has(path.extname(base));
}

function contentTypeFor(relativePath: string): AliceCorpusManifestItem["contentType"] {
  const ext = path.extname(relativePath);
  if (ext === ".md" || ext === ".mdx") return "markdown";
  if (ext === ".json" || ext === ".yaml" || ext === ".yml" || ext === ".toml") {
    return "config";
  }
  if (
    [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sh", ".tf", ".sql", ".css", ".html"].includes(
      ext,
    )
  ) {
    return "code";
  }
  return "text";
}

function walkFiles(root: string): string[] {
  const output: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        output.push(fullPath);
      }
    }
  }
  return output;
}

export function buildAliceCorpusManifest(
  options: BuildAliceCorpusManifestOptions,
): AliceCorpusManifest {
  const items: AliceCorpusManifestItem[] = [];
  let excludedCount = 0;

  for (const root of options.roots) {
    const rootPath = path.resolve(root.path);
    if (!fs.existsSync(rootPath)) continue;
    for (const filePath of walkFiles(rootPath)) {
      const relativePath = normalizeRelativePath(path.relative(rootPath, filePath));
      if (shouldExclude(relativePath) || !shouldInclude(relativePath)) {
        excludedCount += 1;
        continue;
      }
      const bytes = fs.readFileSync(filePath);
      items.push({
        rootId: root.id,
        relativePath,
        absolutePath: filePath,
        contentType: contentTypeFor(relativePath),
        sha256: sha256(bytes),
        byteSize: bytes.byteLength,
      });
    }
  }

  items.sort((a, b) => {
    const left = `${a.rootId}/${a.relativePath}`;
    const right = `${b.rootId}/${b.relativePath}`;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    roots: options.roots.map((root) => ({
      id: root.id,
      path: path.resolve(root.path),
    })),
    items,
    excludedCount,
  };
}
