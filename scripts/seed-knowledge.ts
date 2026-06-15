import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const DEFAULT_EXTENSIONS = [".md", ".txt", ".json", ".yaml", ".yml"];
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_FILE_BYTES = 2_000_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 600_000; // 10 minutes
const DEFAULT_MAX_ATTEMPTS = 1; // No retry by default — partial-state risk
const MANIFEST_SCHEMA_VERSION = 2;

type Frontmatter = Record<string, string | string[]>;

type SeedDocument = {
  content: string;
  filename: string;
  contentType: string;
  metadata: Record<string, unknown>;
};

type UploadResult = {
  filename: string;
  ok: boolean;
  documentId?: string;
  fragmentCount?: number;
  error?: string;
  errorStack?: string;
  errorCause?: string;
  responseBody?: string;
  uploadStartedAt: string;
  uploadEndedAt: string;
  uploadElapsedMs: number;
  attemptCount: number;
};

type DocumentState = "pending" | "succeeded" | "failed";

type ManifestDocument = {
  filename: string;
  contentSha256: string;
  docId?: string | string[];
  domain?: string | string[];
  status?: string | string[];
  byteSize: number;
  batchIndex: number;
  state: DocumentState;
  attemptCount: number;
  documentId?: string;
  fragmentCount?: number;
  uploadStartedAt?: string;
  uploadEndedAt?: string;
  uploadElapsedMs?: number;
  errorMessage?: string;
  errorCause?: string;
  errorStack?: string;
  responseBody?: string;
};

type ManifestBatch = {
  index: number;
  size: number;
  startedAt: string;
  endedAt?: string;
  elapsedMs?: number;
  succeeded: number;
  failed: number;
  attempt: number;
};

type Manifest = {
  schemaVersion: number;
  createdAt: string;
  completedAt: string | null;
  apiBase: string;
  corpusRoot: string;
  corpusSha: string;
  documentCount: number;
  skippedInputs: string[];
  dryRun: boolean;
  config: {
    batchSize: number;
    maxFileBytes: number;
    requestTimeoutMs: number;
    maxAttempts: number;
    failFast: boolean;
    singleDocumentMode: boolean;
    filters: {
      includeDomains: string[];
      excludeStatuses: string[];
      maxDocs: number | null;
    };
  };
  summary: {
    succeeded: number;
    failed: number;
    pending: number;
    totalFragments: number;
    totalElapsedMs: number;
  };
  documents: ManifestDocument[];
  batches: ManifestBatch[];
};

type Args = {
  inputs: string[];
  apiBase: string;
  token?: string;
  batchSize: number;
  maxFileBytes: number;
  dryRun: boolean;
  manifestPath?: string;
  resumeManifestPath?: string;
  extensions: Set<string>;
  requestTimeoutMs: number;
  maxAttempts: number;
  failFast: boolean;
  singleDocumentMode: boolean;
  includeDomains: string[];
  excludeStatuses: string[];
  maxDocs: number | null;
};

function parseArgs(argv: string[]): Args {
  const inputs: string[] = [];
  let apiBase =
    process.env.MILADY_API_BASE?.trim() ||
    process.env.MILAIDY_API_BASE?.trim() ||
    process.env.ELIZA_API_BASE?.trim() ||
    DEFAULT_API_BASE;
  let token =
    process.env.MILADY_API_TOKEN?.trim() ||
    process.env.ELIZA_API_TOKEN?.trim() ||
    process.env.MILAIDY_API_TOKEN?.trim();
  let batchSize = Number.parseInt(
    process.env.KNOWLEDGE_SEED_BATCH_SIZE || `${DEFAULT_BATCH_SIZE}`,
    10,
  );
  let maxFileBytes = Number.parseInt(
    process.env.KNOWLEDGE_SEED_MAX_FILE_BYTES || `${DEFAULT_MAX_FILE_BYTES}`,
    10,
  );
  let requestTimeoutMs = Number.parseInt(
    process.env.KNOWLEDGE_SEED_REQUEST_TIMEOUT_MS ||
      `${DEFAULT_REQUEST_TIMEOUT_MS}`,
    10,
  );
  let maxAttempts = Number.parseInt(
    process.env.KNOWLEDGE_SEED_MAX_ATTEMPTS || `${DEFAULT_MAX_ATTEMPTS}`,
    10,
  );
  let dryRun = false;
  let failFast = false;
  let singleDocumentMode = false;
  let manifestPath: string | undefined;
  let resumeManifestPath: string | undefined;
  const includeDomains: string[] = [];
  const excludeStatuses: string[] = [];
  let maxDocs: number | null = null;
  const extensions = new Set(
    (process.env.KNOWLEDGE_SEED_EXTENSIONS?.split(",") || DEFAULT_EXTENSIONS)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base" && argv[index + 1]) {
      apiBase = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--token" && argv[index + 1]) {
      token = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--batch-size" && argv[index + 1]) {
      batchSize = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--max-file-bytes" && argv[index + 1]) {
      maxFileBytes = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--manifest" && argv[index + 1]) {
      manifestPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--resume-manifest" && argv[index + 1]) {
      resumeManifestPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--request-timeout" && argv[index + 1]) {
      requestTimeoutMs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--max-attempts" && argv[index + 1]) {
      maxAttempts = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--include-domain" && argv[index + 1]) {
      includeDomains.push(argv[index + 1].trim());
      index += 1;
      continue;
    }
    if (arg === "--exclude-status" && argv[index + 1]) {
      excludeStatuses.push(argv[index + 1].trim());
      index += 1;
      continue;
    }
    if (arg === "--max-docs" && argv[index + 1]) {
      maxDocs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--single-document-mode") {
      singleDocumentMode = true;
      continue;
    }
    if (arg === "--fail-fast") {
      failFast = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      inputs.push(arg);
    }
  }

  if (!Number.isFinite(batchSize) || batchSize <= 0 || batchSize > 100) {
    batchSize = DEFAULT_BATCH_SIZE;
  }
  if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
    maxFileBytes = DEFAULT_MAX_FILE_BYTES;
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  }
  if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    maxAttempts = DEFAULT_MAX_ATTEMPTS;
  }
  if (maxDocs !== null && (!Number.isFinite(maxDocs) || maxDocs <= 0)) {
    maxDocs = null;
  }
  if (singleDocumentMode) {
    batchSize = 1;
  }

  return {
    inputs,
    apiBase: apiBase.replace(/\/+$/, ""),
    token,
    batchSize,
    maxFileBytes,
    dryRun,
    manifestPath,
    resumeManifestPath,
    extensions,
    requestTimeoutMs,
    maxAttempts,
    failFast,
    singleDocumentMode,
    includeDomains,
    excludeStatuses,
    maxDocs,
  };
}

function printUsage(): void {
  console.error(
    [
      "Usage: node --import tsx scripts/seed-knowledge.ts <file-or-dir> [more paths] [options]",
      "",
      "Options:",
      "  --base <url>                API base. Default: http://127.0.0.1:3000",
      "  --token <token>             Bearer token. Env fallback: MILADY_API_TOKEN / ELIZA_API_TOKEN / MILAIDY_API_TOKEN",
      "  --batch-size <n>            Documents per bulk request. Default: 25; max: 100",
      "  --max-file-bytes <n>        Skip individual files larger than n bytes. Default: 2000000",
      "  --manifest <path>           Write a seed manifest JSON file (incrementally — checkpoint after every batch)",
      "  --resume-manifest <path>    Load a prior manifest, skip succeeded docs, retry pending+failed (corpusSha must match current corpus)",
      "  --request-timeout <ms>      Per-request timeout via AbortController. Default: 600000 (10 min)",
      "  --max-attempts <n>          Reserved for future use. Currently no-op: every error breaks the attempt loop because the bulk API is non-idempotent and a network failure may have persisted partial state. Default: 1.",
      "  --include-domain <name>     Restrict to documents whose `domain:` frontmatter matches. Repeatable.",
      "  --exclude-status <name>     Skip documents whose `status:` frontmatter matches. Repeatable.",
      "  --max-docs <n>              Process at most N documents (post-filter, post-sort)",
      "  --single-document-mode      Force batchSize=1; one document per HTTP request",
      "  --fail-fast                 Stop on first batch failure (default: continue, record failures in manifest)",
      "  --dry-run                   Build payload and manifest but do not POST",
    ].join("\n"),
  );
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
  maxFileBytes: number,
): Promise<string[]> {
  const absolutePath = path.resolve(targetPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isFile()) {
    if (!extensions.has(path.extname(absolutePath).toLowerCase())) return [];
    if (stats.size > maxFileBytes) {
      console.warn(`[skip] ${absolutePath} exceeds ${maxFileBytes} bytes`);
      return [];
    }
    return [absolutePath];
  }

  if (!stats.isDirectory()) return [];

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(child, extensions, maxFileBytes)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
    const childStats = await fs.stat(child);
    if (childStats.size > maxFileBytes) {
      console.warn(`[skip] ${child} exceeds ${maxFileBytes} bytes`);
      continue;
    }
    files.push(child);
  }

  return files;
}

function inferCorpusRoot(inputs: string[], files: string[]): string {
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (files.some((file) => file.startsWith(`${resolved}${path.sep}`))) {
      return resolved;
    }
  }
  return path.dirname(files[0] || process.cwd());
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const block = content.slice(4, end).split(/\r?\n/);
  const output: Frontmatter = {};
  let currentKey: string | null = null;

  for (const line of block) {
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const current = output[currentKey];
      const next = listItem[1].trim();
      output[currentKey] = Array.isArray(current)
        ? [...current, next]
        : current
          ? [current, next]
          : [next];
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    currentKey = match[1];
    const value = match[2].trim();
    output[currentKey] = value === "" ? [] : value.replace(/^["']|["']$/g, "");
  }

  return output;
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".mdx") return "text/markdown";
  if (ext === ".json") return "application/json";
  if (ext === ".yaml" || ext === ".yml") return "application/yaml";
  return "text/plain";
}

async function buildDocuments(args: Args): Promise<{
  documents: SeedDocument[];
  corpusRoot: string;
  skippedInputs: string[];
}> {
  const allFiles = new Set<string>();
  const skippedInputs: string[] = [];

  for (const input of args.inputs) {
    if (!(await pathExists(input))) {
      skippedInputs.push(input);
      console.warn(`[skip] missing input: ${input}`);
      continue;
    }
    for (const file of await walkFiles(input, args.extensions, args.maxFileBytes)) {
      allFiles.add(file);
    }
  }

  const files = Array.from(allFiles).sort();
  const corpusRoot = inferCorpusRoot(args.inputs, files);
  const ingestedAt = new Date().toISOString();
  const deploySha =
    process.env.ALICE_DEPLOY_REPO_SHA ||
    process.env.BOT_SOURCE_SHA ||
    process.env.GITHUB_SHA ||
    "unknown";
  const runtimeSha = process.env.MILAIDY_RUNTIME_SHA || "unknown";

  const documents: SeedDocument[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(corpusRoot, filePath).split(path.sep).join("/");
    const frontmatter = parseFrontmatter(content);
    const contentSha256 = sha256(content);

    documents.push({
      content,
      filename: relativePath,
      contentType: contentTypeFor(filePath),
      metadata: {
        source: "alice-corpus",
        filename: relativePath,
        relativePath,
        corpusRoot: path.basename(corpusRoot),
        corpusIngestedAt: ingestedAt,
        corpusDeploySha: deploySha,
        runtimeSha,
        contentSha256,
        docId: frontmatter.doc_id,
        title: frontmatter.title,
        domain: frontmatter.domain,
        status: frontmatter.status,
        freshnessSlaDays: frontmatter.freshness_sla_days,
      },
    });
  }

  return { documents, corpusRoot, skippedInputs };
}

function describeError(error: unknown): {
  message: string;
  cause?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? `${error.cause.name}: ${error.cause.message}`
        : error.cause !== undefined
          ? String(error.cause)
          : undefined;
    return { message: error.message, cause, stack: error.stack };
  }
  return { message: String(error) };
}

// Retries are intentionally DISABLED for /api/knowledge/documents/bulk.
//
// The API processes documents sequentially via addKnowledge() and generates
// a fresh `clientDocumentId` per call. A connection-level error (ECONNRESET,
// `fetch failed`, ETIMEDOUT, our own AbortError, anything) can happen AFTER
// the server has already persisted part of the batch. The 2026-05-02
// staging failure was exactly this shape: ~31 documents and ~270 fragments
// were persisted before the connection dropped.
//
// Retrying compounds the partial-state damage instead of fixing it. There
// is no client-side way to know whether a network error left zero docs or
// fifteen docs in the DB.
//
// The --max-attempts flag is preserved as a future hook for when the API
// becomes batch-atomic (single transaction) or idempotent (clientDocumentId
// stable across retries). Until then, every attempt outcome — HTTP error,
// JSON parse error, network error, abort — breaks the attempt loop.
//
// Tracked: PR #3 (API instrumentation) considers idempotency; PR #7
// (durable corpus store) gives us a deterministic-ID corpus surface that
// makes ingest naturally idempotent.

// NDJSON streaming consumer.
//
// We send `Accept: application/x-ndjson, application/json;q=0.5`. Servers
// that opt into PR #110 (alice-bot 555-bot/milaidy) flush headers
// immediately and stream one JSON line per completed doc — `{type:"result",
// index, ok, ...}` — followed by a final `{type:"summary",...}` line. The
// seeder dispatches each `result` line via `onDocumentResult` so the main
// loop can checkpoint the manifest incrementally; on abort or network
// failure mid-batch, the manifest already reflects every doc that has
// reached terminal state on the server.
//
// Servers that don't opt in fall back to the existing collected JSON
// (Content-Type: application/json), and we parse it with `response.text()`
// + `JSON.parse` like before — fully backwards compatible.
//
// Per-line inactivity timeout replaces the old single-shot request timeout
// for the streaming case. As long as a chunk arrives within
// inactivityTimeoutMs, the request keeps going. The aggregate
// requestTimeoutMs still applies as an outer ceiling so a server that
// dribbles output forever doesn't hold the seeder hostage.

const STREAMING_INACTIVITY_TIMEOUT_MS = 60_000;

async function postBatch(
  apiBase: string,
  token: string | undefined,
  documents: SeedDocument[],
  options: {
    requestTimeoutMs: number;
    maxAttempts: number;
    batchIndex: number;
    onDocumentResult?: (result: UploadResult) => void;
  },
): Promise<{
  perDocument: UploadResult[];
  attemptCount: number;
  attemptHistory: Array<{ attempt: number; outcome: string; elapsedMs: number }>;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson, application/json;q=0.5",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = JSON.stringify({ documents });
  const bodyBytes = Buffer.byteLength(body, "utf8");

  const attemptHistory: Array<{
    attempt: number;
    outcome: string;
    elapsedMs: number;
  }> = [];

  type ServerResult = {
    type?: string;
    index?: number;
    filename?: string;
    ok?: boolean;
    documentId?: string;
    fragmentCount?: number;
    error?: string;
  };

  let lastError: unknown = null;
  let parsedResults: ServerResult[] | null = null;
  let httpStatus: number | null = null;
  let httpBody: string | null = null;
  let streamingMode = false;
  let attempt = 0;

  for (attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const overallTimeoutHandle = setTimeout(
      () => controller.abort(),
      options.requestTimeoutMs,
    );
    let inactivityTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const armInactivityTimer = () => {
      if (inactivityTimeoutHandle) clearTimeout(inactivityTimeoutHandle);
      inactivityTimeoutHandle = setTimeout(
        () => controller.abort(),
        STREAMING_INACTIVITY_TIMEOUT_MS,
      );
    };

    try {
      console.log(
        `[seed-knowledge] batch ${options.batchIndex + 1} attempt ${attempt}/${options.maxAttempts} POST /api/knowledge/documents/bulk docs=${documents.length} bytes=${bodyBytes} timeout=${options.requestTimeoutMs}ms`,
      );

      const response = await fetch(`${apiBase}/api/knowledge/documents/bulk`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      httpStatus = response.status;
      const contentType = response.headers.get("content-type") || "";
      streamingMode = contentType.includes("application/x-ndjson");

      if (!response.ok) {
        const text = await response.text();
        const elapsedMs = Date.now() - attemptStartedAt;
        httpBody = text;
        attemptHistory.push({
          attempt,
          outcome: `http_${response.status}`,
          elapsedMs,
        });
        lastError = new Error(
          `HTTP ${response.status} after ${elapsedMs}ms: ${text.slice(0, 500)}`,
        );
        break;
      }

      if (streamingMode && response.body) {
        console.log(
          `[seed-knowledge] batch ${options.batchIndex + 1} streaming NDJSON (inactivity timeout=${STREAMING_INACTIVITY_TIMEOUT_MS}ms)`,
        );
        armInactivityTimer();
        const decoder = new TextDecoder();
        let buffer = "";
        const collected: ServerResult[] = [];

        const dispatchLine = (rawLine: string): void => {
          const line = rawLine.trim();
          if (!line) return;
          let parsed: ServerResult & { totalElapsedMs?: number };
          try {
            parsed = JSON.parse(line);
          } catch (parseErr) {
            console.warn(
              `[seed-knowledge] batch ${options.batchIndex + 1} ignoring unparseable NDJSON line: ${(parseErr as Error).message}; line=${line.slice(0, 200)}`,
            );
            return;
          }
          if (parsed.type === "result") {
            collected.push(parsed);
            if (options.onDocumentResult) {
              const filename =
                parsed.filename ||
                documents[parsed.index ?? collected.length - 1]?.filename ||
                `document-${parsed.index ?? collected.length - 1}`;
              const now = new Date().toISOString();
              options.onDocumentResult({
                filename,
                ok: parsed.ok === true,
                documentId: parsed.documentId,
                fragmentCount: parsed.fragmentCount,
                error: parsed.error,
                uploadStartedAt: now,
                uploadEndedAt: now,
                uploadElapsedMs: 0,
                attemptCount: attempt,
              });
            }
          } else if (parsed.type === "summary") {
            const totalElapsed = parsed.totalElapsedMs;
            console.log(
              `[seed-knowledge] batch ${options.batchIndex + 1} server summary received ok=${parsed.ok} success=${(parsed as { successCount?: number }).successCount} failed=${(parsed as { failureCount?: number }).failureCount} totalElapsedMs=${typeof totalElapsed === "number" ? totalElapsed : "?"}`,
            );
          }
          // Unknown types are ignored for forward-compat with future
          // server additions (e.g. progress heartbeats).
        };

        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            armInactivityTimer();
            buffer += decoder.decode(value, { stream: true });
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);
              dispatchLine(line);
            }
          }
        } finally {
          if (inactivityTimeoutHandle) clearTimeout(inactivityTimeoutHandle);
          try {
            reader.releaseLock();
          } catch {
            // reader may already be released if the stream errored
          }
        }
        // flush trailing line (in case server didn't end with \n)
        const tail = (buffer + decoder.decode()).trim();
        if (tail) dispatchLine(tail);

        const elapsedMs = Date.now() - attemptStartedAt;
        attemptHistory.push({
          attempt,
          outcome: "ok_stream",
          elapsedMs,
        });
        parsedResults = collected;
        lastError = null;
        break;
      }

      // Buffered (non-streaming) path, kept for backwards compatibility
      // with servers that haven't deployed PR #110.
      const text = await response.text();
      httpBody = text;
      const elapsedMs = Date.now() - attemptStartedAt;
      try {
        const parsed = text ? JSON.parse(text) : {};
        parsedResults = parsed.results || [];
      } catch (parseError) {
        attemptHistory.push({
          attempt,
          outcome: "json_parse_error",
          elapsedMs,
        });
        lastError = new Error(
          `JSON parse error after HTTP ${response.status} in ${elapsedMs}ms: ${(parseError as Error).message}`,
          { cause: parseError as Error },
        );
        break;
      }

      attemptHistory.push({ attempt, outcome: "ok", elapsedMs });
      lastError = null;
      break;
    } catch (error) {
      const elapsedMs = Date.now() - attemptStartedAt;
      lastError = error;

      const aborted = controller.signal.aborted;

      attemptHistory.push({
        attempt,
        outcome: aborted ? "timeout_aborted" : "network_or_fatal",
        elapsedMs,
      });

      // Retries are disabled by design (see comment near isSafeRetryError
      // section). Even ostensibly "safe" network errors may have left
      // partial server-side state. Break out and let the operator decide
      // (rollback via cleanup, then resume or fresh run).
      break;
    } finally {
      clearTimeout(overallTimeoutHandle);
      if (inactivityTimeoutHandle) clearTimeout(inactivityTimeoutHandle);
    }
  }

  const finalAttempt = Math.max(1, Math.min(attempt, options.maxAttempts));

  if (lastError && !parsedResults) {
    const detail = describeError(lastError);
    const truncatedBody = httpBody ? httpBody.slice(0, 1000) : undefined;
    return {
      attemptCount: finalAttempt,
      attemptHistory,
      perDocument: documents.map((document) => {
        const now = new Date().toISOString();
        return {
          filename: document.filename,
          ok: false,
          error:
            httpStatus !== null
              ? `HTTP ${httpStatus}: ${detail.message}`
              : detail.message,
          errorStack: detail.stack,
          errorCause: detail.cause,
          responseBody: truncatedBody,
          uploadStartedAt: now,
          uploadEndedAt: now,
          uploadElapsedMs: 0,
          attemptCount: finalAttempt,
        };
      }),
    };
  }

  const now = new Date().toISOString();
  const perDocument: UploadResult[] = (parsedResults || []).map(
    (result, index) => {
      return {
        filename:
          result.filename || documents[index]?.filename || `document-${index}`,
        ok: result.ok === true,
        documentId: result.documentId,
        fragmentCount: result.fragmentCount,
        error: result.error,
        uploadStartedAt: now,
        uploadEndedAt: now,
        uploadElapsedMs: 0, // server-side per-doc timing is PR #3 (API instrumentation)
        attemptCount: finalAttempt,
      };
    },
  );

  // If the response had fewer entries than documents, mark the missing ones failed.
  if (perDocument.length < documents.length) {
    const seen = new Set(perDocument.map((r) => r.filename));
    for (const document of documents) {
      if (seen.has(document.filename)) continue;
      perDocument.push({
        filename: document.filename,
        ok: false,
        error: "API response missing this document's result entry",
        uploadStartedAt: now,
        uploadEndedAt: now,
        uploadElapsedMs: 0,
        attemptCount: finalAttempt,
      });
    }
  }

  return { perDocument, attemptCount: finalAttempt, attemptHistory };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function writeManifest(
  manifestPath: string | undefined,
  manifest: Manifest,
): Promise<void> {
  if (!manifestPath) return;
  await fs.mkdir(path.dirname(path.resolve(manifestPath)), { recursive: true });
  // Atomic write: temp + rename, so a partial write doesn't corrupt the
  // manifest if the process is killed mid-checkpoint.
  const tempPath = `${manifestPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(tempPath, manifestPath);
}

async function loadManifest(manifestPath: string): Promise<Manifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.schemaVersion !== "number") return null;
    return parsed as Manifest;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function applyFilters(
  documents: SeedDocument[],
  args: Args,
): { kept: SeedDocument[]; filtered: SeedDocument[] } {
  const kept: SeedDocument[] = [];
  const filtered: SeedDocument[] = [];

  for (const document of documents) {
    const domain = document.metadata.domain;
    const status = document.metadata.status;
    const domainStr = Array.isArray(domain) ? domain[0] : domain;
    const statusStr = Array.isArray(status) ? status[0] : status;

    if (
      args.includeDomains.length > 0 &&
      (!domainStr ||
        !args.includeDomains.includes(String(domainStr)))
    ) {
      filtered.push(document);
      continue;
    }
    if (
      args.excludeStatuses.length > 0 &&
      statusStr &&
      args.excludeStatuses.includes(String(statusStr))
    ) {
      filtered.push(document);
      continue;
    }
    kept.push(document);
  }

  if (args.maxDocs !== null && kept.length > args.maxDocs) {
    return {
      kept: kept.slice(0, args.maxDocs),
      filtered: [...filtered, ...kept.slice(args.maxDocs)],
    };
  }

  return { kept, filtered };
}

function buildInitialManifest(
  args: Args,
  corpusRoot: string,
  corpusSha: string,
  documents: SeedDocument[],
  skippedInputs: string[],
): Manifest {
  const manifestDocuments: ManifestDocument[] = documents.map(
    (document, index) => ({
      filename: document.filename,
      contentSha256: String(document.metadata.contentSha256),
      docId: document.metadata.docId as string | string[] | undefined,
      domain: document.metadata.domain as string | string[] | undefined,
      status: document.metadata.status as string | string[] | undefined,
      byteSize: Buffer.byteLength(document.content, "utf8"),
      batchIndex: Math.floor(index / args.batchSize),
      state: "pending",
      attemptCount: 0,
    }),
  );

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    completedAt: null,
    apiBase: args.apiBase,
    corpusRoot,
    corpusSha,
    documentCount: documents.length,
    skippedInputs,
    dryRun: args.dryRun,
    config: {
      batchSize: args.batchSize,
      maxFileBytes: args.maxFileBytes,
      requestTimeoutMs: args.requestTimeoutMs,
      maxAttempts: args.maxAttempts,
      failFast: args.failFast,
      singleDocumentMode: args.singleDocumentMode,
      filters: {
        includeDomains: args.includeDomains,
        excludeStatuses: args.excludeStatuses,
        maxDocs: args.maxDocs,
      },
    },
    summary: {
      succeeded: 0,
      failed: 0,
      pending: documents.length,
      totalFragments: 0,
      totalElapsedMs: 0,
    },
    documents: manifestDocuments,
    batches: [],
  };
}

function applyResumeManifest(
  manifest: Manifest,
  resumed: Manifest,
): Manifest {
  if (resumed.corpusSha !== manifest.corpusSha) {
    throw new Error(
      `--resume-manifest corpusSha mismatch: prior=${resumed.corpusSha.slice(0, 12)} current=${manifest.corpusSha.slice(0, 12)}. ` +
        "Refusing to resume across corpus changes; start a fresh run.",
    );
  }
  // Carry forward succeeded states.
  const priorByFilename = new Map(
    resumed.documents.map((doc) => [doc.filename, doc]),
  );
  for (const doc of manifest.documents) {
    const prior = priorByFilename.get(doc.filename);
    if (!prior) continue;
    if (prior.state === "succeeded") {
      doc.state = "succeeded";
      doc.attemptCount = prior.attemptCount;
      doc.documentId = prior.documentId;
      doc.fragmentCount = prior.fragmentCount;
      doc.uploadStartedAt = prior.uploadStartedAt;
      doc.uploadEndedAt = prior.uploadEndedAt;
      doc.uploadElapsedMs = prior.uploadElapsedMs;
    } else if (prior.state === "failed") {
      // Carry attemptCount forward; allow another attempt on this run.
      doc.attemptCount = prior.attemptCount;
      doc.errorMessage = prior.errorMessage;
      doc.errorCause = prior.errorCause;
      doc.errorStack = prior.errorStack;
      doc.responseBody = prior.responseBody;
      doc.state = "pending"; // retried this run
    }
  }
  manifest.batches = resumed.batches.slice();
  return manifest;
}

function recomputeSummary(manifest: Manifest): void {
  let succeeded = 0;
  let failed = 0;
  let pending = 0;
  let totalFragments = 0;
  let totalElapsedMs = 0;
  for (const doc of manifest.documents) {
    if (doc.state === "succeeded") {
      succeeded += 1;
      totalFragments += doc.fragmentCount || 0;
      totalElapsedMs += doc.uploadElapsedMs || 0;
    } else if (doc.state === "failed") {
      failed += 1;
    } else {
      pending += 1;
    }
  }
  manifest.summary = {
    succeeded,
    failed,
    pending,
    totalFragments,
    totalElapsedMs,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.inputs.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const overallStartedAt = Date.now();

  const { documents: rawDocuments, corpusRoot, skippedInputs } =
    await buildDocuments(args);

  // Apply filters (--include-domain, --exclude-status, --max-docs).
  const { kept: documents, filtered } = applyFilters(rawDocuments, args);
  if (filtered.length > 0) {
    console.log(
      `[seed-knowledge] filtered out ${filtered.length} doc(s) (include-domain=${JSON.stringify(args.includeDomains)} exclude-status=${JSON.stringify(args.excludeStatuses)} max-docs=${args.maxDocs ?? "none"})`,
    );
  }

  // Compute corpusSha from the FILTERED set so resume comparisons match.
  const corpusSha = sha256(
    documents
      .map((document) => `${document.filename}:${document.metadata.contentSha256}`)
      .join("\n"),
  );

  const manifest = buildInitialManifest(
    args,
    corpusRoot,
    corpusSha,
    documents,
    skippedInputs,
  );

  // Resume if requested. If --resume-manifest is provided we MUST find a
  // valid prior manifest — silently starting fresh on a typo or missing
  // mount would re-upload already-succeeded documents and recreate the
  // partial-state failure mode this whole flag set exists to prevent.
  if (args.resumeManifestPath) {
    let prior: Manifest | null = null;
    try {
      prior = await loadManifest(args.resumeManifestPath);
    } catch (error) {
      const detail = describeError(error);
      throw new Error(
        `--resume-manifest ${args.resumeManifestPath} could not be read: ${detail.message}` +
          (detail.cause ? ` (cause: ${detail.cause})` : ""),
        { cause: error as Error },
      );
    }
    if (!prior) {
      throw new Error(
        `--resume-manifest ${args.resumeManifestPath} not found. ` +
          "Resume was explicitly requested; refusing to silently start fresh " +
          "because that would re-upload already-succeeded docs and recreate " +
          "partial-state risk. " +
          "If a fresh run is intended, omit --resume-manifest.",
      );
    }
    if (prior.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      throw new Error(
        `--resume-manifest schema version ${prior.schemaVersion} does not match expected ${MANIFEST_SCHEMA_VERSION}`,
      );
    }
    applyResumeManifest(manifest, prior);
    recomputeSummary(manifest);
    console.log(
      `[seed-knowledge] resumed from ${args.resumeManifestPath} succeeded=${manifest.summary.succeeded}/${manifest.documentCount} pending=${manifest.summary.pending} previousFailed=${manifest.summary.failed}`,
    );
  }

  if (documents.length === 0) {
    await writeManifest(args.manifestPath, manifest);
    throw new Error("No eligible knowledge files found.");
  }

  console.log(
    `[seed-knowledge] prepared ${documents.length} document(s) from ${corpusRoot} corpusSha=${corpusSha.slice(0, 12)} batchSize=${args.batchSize} requestTimeout=${args.requestTimeoutMs}ms maxAttempts=${args.maxAttempts}`,
  );

  if (args.dryRun) {
    await writeManifest(args.manifestPath, manifest);
    console.log("[seed-knowledge] dry run complete; no documents uploaded.");
    return;
  }

  const batches = chunk(documents, args.batchSize);
  const docByFilename = new Map(
    manifest.documents.map((doc) => [doc.filename, doc]),
  );

  for (const [index, batch] of batches.entries()) {
    // Skip whole batch if all docs already succeeded (resume case).
    const pendingInBatch = batch.filter((doc) => {
      const m = docByFilename.get(doc.filename);
      return !m || m.state !== "succeeded";
    });
    if (pendingInBatch.length === 0) {
      console.log(
        `[seed-knowledge] batch ${index + 1}/${batches.length} skipped (all ${batch.length} docs already succeeded per resume manifest)`,
      );
      continue;
    }

    const batchStartedAt = new Date().toISOString();
    const batchStartMs = Date.now();
    console.log(
      `[seed-knowledge] batch ${index + 1}/${batches.length} starting (${pendingInBatch.length}/${batch.length} pending docs after resume filter)`,
    );

    const { perDocument, attemptCount, attemptHistory } = await postBatch(
      args.apiBase,
      args.token,
      pendingInBatch,
      {
        requestTimeoutMs: args.requestTimeoutMs,
        maxAttempts: args.maxAttempts,
        batchIndex: index,
      },
    );

    const elapsedMs = Date.now() - batchStartMs;
    const succeeded = perDocument.filter((r) => r.ok).length;
    const failed = perDocument.length - succeeded;

    // Update manifest documents.
    for (const result of perDocument) {
      const doc = docByFilename.get(result.filename);
      if (!doc) continue;
      // Accumulate attempt count across resumes — prior failed runs may
      // have already attempted this doc N times. Replacing instead of
      // adding would underreport retries on a resumed run and make
      // repeated failures look like first attempts.
      doc.attemptCount = (doc.attemptCount || 0) + result.attemptCount;
      doc.uploadStartedAt = result.uploadStartedAt;
      doc.uploadEndedAt = result.uploadEndedAt;
      doc.uploadElapsedMs = result.uploadElapsedMs;
      if (result.ok) {
        doc.state = "succeeded";
        doc.documentId = result.documentId;
        doc.fragmentCount = result.fragmentCount;
        doc.errorMessage = undefined;
        doc.errorCause = undefined;
        doc.errorStack = undefined;
        doc.responseBody = undefined;
      } else {
        doc.state = "failed";
        doc.errorMessage = result.error;
        doc.errorCause = result.errorCause;
        doc.errorStack = result.errorStack;
        doc.responseBody = result.responseBody;
      }
    }

    manifest.batches.push({
      index,
      size: batch.length,
      startedAt: batchStartedAt,
      endedAt: new Date().toISOString(),
      elapsedMs,
      succeeded,
      failed,
      attempt: attemptCount,
    });

    recomputeSummary(manifest);

    // Checkpoint after every batch.
    await writeManifest(args.manifestPath, manifest);

    const cumulative = manifest.summary;
    console.log(
      `[seed-knowledge] batch ${index + 1}/${batches.length} done elapsed=${elapsedMs}ms succeeded=${succeeded} failed=${failed} attempts=${attemptCount} cumulative=succeeded ${cumulative.succeeded}/${manifest.documentCount} failed=${cumulative.failed} fragments=${cumulative.totalFragments}`,
    );
    if (attemptHistory.length > 1) {
      console.log(
        `[seed-knowledge] batch ${index + 1} attempt history: ${JSON.stringify(attemptHistory)}`,
      );
    }

    if (failed > 0) {
      for (const result of perDocument.filter((r) => !r.ok)) {
        console.error(
          `[seed-knowledge] failed ${result.filename}: ${result.error ?? "unknown error"}` +
            (result.errorCause ? ` (cause: ${result.errorCause})` : ""),
        );
      }
      if (args.failFast) {
        manifest.completedAt = new Date().toISOString();
        await writeManifest(args.manifestPath, manifest);
        console.error(
          `[seed-knowledge] --fail-fast: stopping after batch ${index + 1} (${failed} failure(s) in this batch).`,
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  manifest.completedAt = new Date().toISOString();
  await writeManifest(args.manifestPath, manifest);

  const overallElapsedMs = Date.now() - overallStartedAt;
  console.log(
    `[seed-knowledge] done elapsed=${overallElapsedMs}ms succeeded=${manifest.summary.succeeded} failed=${manifest.summary.failed} fragments=${manifest.summary.totalFragments}`,
  );

  if (manifest.summary.failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const detail = describeError(error);
  console.error(`[seed-knowledge] ${detail.message}`);
  if (detail.cause) console.error(`[seed-knowledge] cause: ${detail.cause}`);
  if (detail.stack) console.error(detail.stack);
  process.exitCode = 1;
});
