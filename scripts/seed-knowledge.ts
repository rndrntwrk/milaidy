import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const DEFAULT_EXTENSIONS = [".md", ".txt", ".json", ".yaml", ".yml"];
const DEFAULT_MAX_BYTES = 1_000_000;

type UploadResult = {
  filePath: string;
  ok: boolean;
  status?: number;
  error?: string;
};

function parseArgs(argv: string[]): {
  inputs: string[];
  apiBase: string;
  token?: string;
  maxBytes: number;
  extensions: string[];
} {
  const inputs: string[] = [];
  let apiBase = process.env.MILAIDY_API_BASE?.trim() || DEFAULT_API_BASE;
  let token = process.env.MILAIDY_API_TOKEN?.trim();
  let maxBytes = Number.parseInt(
    process.env.KNOWLEDGE_MAX_BYTES || `${DEFAULT_MAX_BYTES}`,
    10,
  );
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) maxBytes = DEFAULT_MAX_BYTES;

  const extensions = (
    process.env.KNOWLEDGE_INCLUDE_EXTENSIONS?.split(",") || DEFAULT_EXTENSIONS
  )
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base" && argv[i + 1]) {
      apiBase = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--token" && argv[i + 1]) {
      token = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--max-bytes" && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxBytes = parsed;
      }
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      inputs.push(arg);
    }
  }

  return {
    inputs,
    apiBase: apiBase.replace(/\/+$/, ""),
    token,
    maxBytes,
    extensions,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(
  targetPath: string,
  extensions: Set<string>,
  maxBytes: number,
): Promise<string[]> {
  const absPath = path.resolve(targetPath);
  const stats = await fs.stat(absPath);
  if (stats.isFile()) {
    const ext = path.extname(absPath).toLowerCase();
    if (!extensions.has(ext) || stats.size > maxBytes) return [];
    return [absPath];
  }

  if (!stats.isDirectory()) return [];

  const found: string[] = [];
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const child = path.join(absPath, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(child, extensions, maxBytes)));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.has(ext)) continue;
    const childStats = await fs.stat(child);
    if (childStats.size > maxBytes) continue;
    found.push(child);
  }

  return found;
}

async function uploadKnowledgeFile(
  apiBase: string,
  token: string | undefined,
  filePath: string,
): Promise<UploadResult> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const filename = path.basename(filePath);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${apiBase}/api/knowledge/documents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content,
        filename,
        contentType: "text/plain",
        metadata: {
          sourcePath: filePath,
          ingestedAt: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        filePath,
        ok: false,
        status: response.status,
        error: body.slice(0, 300),
      };
    }

    return { filePath, ok: true, status: response.status };
  } catch (error) {
    return {
      filePath,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const { inputs, apiBase, token, maxBytes, extensions } = parseArgs(
    process.argv.slice(2),
  );

  if (inputs.length === 0) {
    console.error(
      "Usage: node --import tsx scripts/seed-knowledge.ts <file-or-dir> [more paths] [--base URL] [--token TOKEN]",
    );
    process.exitCode = 1;
    return;
  }

  const extSet = new Set(extensions);
  const allFiles = new Set<string>();

  for (const input of inputs) {
    if (!(await pathExists(input))) {
      console.warn(`[skip] missing path: ${input}`);
      continue;
    }
    const files = await walkFiles(input, extSet, maxBytes);
    for (const filePath of files) allFiles.add(filePath);
  }

  const targets = Array.from(allFiles).sort();
  if (targets.length === 0) {
    console.warn("No eligible files found for ingestion.");
    return;
  }

  console.log(
    `Seeding ${targets.length} knowledge file(s) to ${apiBase}/api/knowledge/documents`,
  );

  const results: UploadResult[] = [];
  for (const filePath of targets) {
    const result = await uploadKnowledgeFile(apiBase, token, filePath);
    results.push(result);
    if (result.ok) {
      console.log(`[ok] ${filePath}`);
    } else {
      console.error(
        `[fail] ${filePath}${result.status ? ` (status ${result.status})` : ""}: ${result.error ?? "unknown error"}`,
      );
    }
  }

  const successCount = results.filter((item) => item.ok).length;
  const failureCount = results.length - successCount;
  console.log(`Done: ${successCount} succeeded, ${failureCount} failed.`);
  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

void main();
