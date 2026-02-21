#!/usr/bin/env -S node --import tsx

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const DEFAULT_EXTENSIONS = [".md", ".txt", ".json", ".yaml", ".yml"];
const DEFAULT_MAX_BYTES = 1_000_000;

interface CliArgs {
  inputs: string[];
  apiBase: string;
  token?: string;
  maxBytes: number;
  extensions: string[];
  ingestLabel: string;
  prune: boolean;
}

interface LocalDoc {
  absPath: string;
  sourcePath: string;
  filename: string;
  content: string;
  sourceHash: string;
}

interface RemoteDoc {
  id: string;
  filename: string;
  sourcePath: string | null;
  sourceHash: string | null;
  createdAt: number;
}

function parseArgs(argv: string[]): CliArgs {
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

  let ingestLabel =
    process.env.KNOWLEDGE_INGEST_LABEL?.trim() ||
    `sync-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  let prune = false;

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
    if (arg === "--label" && argv[i + 1]) {
      ingestLabel = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--prune") {
      prune = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      inputs.push(arg);
    }
  }

  return {
    inputs: inputs.length > 0 ? inputs : ["knowledge"],
    apiBase: apiBase.replace(/\/+$/, ""),
    token,
    maxBytes,
    extensions,
    ingestLabel,
    prune,
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

function toPosix(input: string): string {
  return input.split(path.sep).join("/");
}

function digestContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function walkEligibleFiles(
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
      found.push(...(await walkEligibleFiles(child, extensions, maxBytes)));
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

async function collectLocalDocs(
  inputs: string[],
  extensions: Set<string>,
  maxBytes: number,
): Promise<LocalDoc[]> {
  const cwd = process.cwd();
  const files = new Set<string>();

  for (const input of inputs) {
    if (!(await pathExists(input))) {
      console.warn(`[knowledge-sync] skip missing path: ${input}`);
      continue;
    }
    for (const filePath of await walkEligibleFiles(
      input,
      extensions,
      maxBytes,
    )) {
      files.add(path.resolve(filePath));
    }
  }

  const docs: LocalDoc[] = [];
  for (const absPath of Array.from(files).sort()) {
    const content = await fs.readFile(absPath, "utf8");
    const rel = toPosix(path.relative(cwd, absPath));
    docs.push({
      absPath,
      sourcePath: rel,
      filename: rel,
      content,
      sourceHash: digestContent(content),
    });
  }
  return docs;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchRemoteDocs(
  apiBase: string,
  token?: string,
): Promise<RemoteDoc[]> {
  const docs: RemoteDoc[] = [];
  const pageSize = 500;
  let offset = 1; // API currently uses 1-based offset semantics.

  while (true) {
    const response = await fetch(
      `${apiBase}/api/knowledge/documents?limit=${pageSize}&offset=${offset}`,
      {
        headers: authHeaders(token),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to list remote documents (${response.status}): ${text.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      documents?: Array<{
        id: string;
        filename?: string;
        sourcePath?: string | null;
        sourceHash?: string | null;
        createdAt?: number;
      }>;
    };
    const page = payload.documents ?? [];
    for (const row of page) {
      docs.push({
        id: row.id,
        filename: row.filename ?? "",
        sourcePath: row.sourcePath ?? null,
        sourceHash: row.sourceHash ?? null,
        createdAt: row.createdAt ?? 0,
      });
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return docs;
}

async function deleteRemoteDoc(
  apiBase: string,
  token: string | undefined,
  id: string,
): Promise<void> {
  const response = await fetch(
    `${apiBase}/api/knowledge/documents/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to delete document ${id} (${response.status}): ${text.slice(0, 300)}`,
    );
  }
}

async function uploadLocalDoc(
  apiBase: string,
  token: string | undefined,
  ingestLabel: string,
  doc: LocalDoc,
): Promise<void> {
  const response = await fetch(`${apiBase}/api/knowledge/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({
      content: doc.content,
      filename: doc.filename,
      contentType: "text/plain",
      metadata: {
        source: "sync",
        sourcePath: doc.sourcePath,
        sourceHash: doc.sourceHash,
        metadataVersion: 1,
        ingestLabel,
        syncedAt: new Date().toISOString(),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to upload ${doc.sourcePath} (${response.status}): ${text.slice(0, 300)}`,
    );
  }
}

function pickCanonical(documents: RemoteDoc[]): RemoteDoc {
  return [...documents].sort((a, b) => b.createdAt - a.createdAt)[0];
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const extSet = new Set(cli.extensions);

  const localDocs = await collectLocalDocs(cli.inputs, extSet, cli.maxBytes);
  if (localDocs.length === 0) {
    console.warn("[knowledge-sync] no eligible local files found.");
    return;
  }

  console.log(
    `[knowledge-sync] syncing ${localDocs.length} local docs to ${cli.apiBase}`,
  );
  const remoteDocs = await fetchRemoteDocs(cli.apiBase, cli.token);

  const remoteByPath = new Map<string, RemoteDoc[]>();
  for (const doc of remoteDocs) {
    if (!doc.sourcePath) continue;
    const key = toPosix(doc.sourcePath);
    const list = remoteByPath.get(key) ?? [];
    list.push(doc);
    remoteByPath.set(key, list);
  }

  const localByPath = new Map(localDocs.map((doc) => [doc.sourcePath, doc]));
  let uploaded = 0;
  let replaced = 0;
  let skipped = 0;
  let deleted = 0;

  for (const local of localDocs) {
    const remoteCandidates = remoteByPath.get(local.sourcePath) ?? [];
    if (remoteCandidates.length === 0) {
      await uploadLocalDoc(cli.apiBase, cli.token, cli.ingestLabel, local);
      uploaded += 1;
      continue;
    }

    const withHashMatch = remoteCandidates.filter(
      (doc) => doc.sourceHash === local.sourceHash,
    );
    if (withHashMatch.length > 0) {
      const canonical = pickCanonical(withHashMatch);
      const extras = remoteCandidates.filter((doc) => doc.id !== canonical.id);
      for (const extra of extras) {
        await deleteRemoteDoc(cli.apiBase, cli.token, extra.id);
        deleted += 1;
      }
      skipped += 1;
      continue;
    }

    for (const stale of remoteCandidates) {
      await deleteRemoteDoc(cli.apiBase, cli.token, stale.id);
      deleted += 1;
    }
    await uploadLocalDoc(cli.apiBase, cli.token, cli.ingestLabel, local);
    replaced += 1;
  }

  if (cli.prune) {
    const managedPrefixes = cli.inputs.map((input) =>
      toPosix(path.relative(process.cwd(), path.resolve(input))).replace(
        /\/+$/,
        "",
      ),
    );
    for (const remote of remoteDocs) {
      if (!remote.sourcePath) continue;
      if (localByPath.has(toPosix(remote.sourcePath))) continue;
      const sourcePath = toPosix(remote.sourcePath);
      const managed = managedPrefixes.some(
        (prefix) =>
          sourcePath === prefix || sourcePath.startsWith(`${prefix}/`),
      );
      if (!managed) continue;
      await deleteRemoteDoc(cli.apiBase, cli.token, remote.id);
      deleted += 1;
    }
  }

  console.log(
    `[knowledge-sync] done uploaded=${uploaded} replaced=${replaced} skipped=${skipped} deleted=${deleted}`,
  );
}

void main().catch((error) => {
  console.error(
    `[knowledge-sync] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
