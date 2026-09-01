#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILDKIT_TIMING_SCHEMA = "alice.buildkit-timing.v1";

export class AliceBuildkitTimingError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_BUILDKIT_TIMING_INVALID:${predicateId}`);
    this.name = "AliceBuildkitTimingError";
    this.code = "ALICE_BUILDKIT_TIMING_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

function fail(predicateId, details = {}) {
  throw new AliceBuildkitTimingError(predicateId, details);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function parseConcatenatedJson(text) {
  if (typeof text !== "string" || text.length === 0) {
    fail("OTLP_EMPTY");
  }
  const values = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start === -1) {
      if (/\s/.test(char)) {
        continue;
      }
      if (char !== "{") {
        fail("OTLP_OBJECT_EXPECTED", { offset: index, observed: char });
      }
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, index + 1);
        try {
          values.push(JSON.parse(slice));
        } catch (error) {
          fail("OTLP_JSON_INVALID", {
            offset: start,
            message: error.message,
          });
        }
        start = -1;
      }
    }
  }
  if (start !== -1 || depth !== 0 || inString) {
    fail("OTLP_TRUNCATED", { start, depth, inString });
  }
  if (values.length === 0) {
    fail("OTLP_NO_SPANS");
  }
  return values;
}

function parseTimeNs(value) {
  if (typeof value !== "string") {
    fail("SPAN_TIME_INVALID", { observedType: typeof value });
  }
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(
    value,
  );
  if (!match) {
    fail("SPAN_TIME_INVALID", { observed: value.slice(0, 80) });
  }
  const baseMs = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(baseMs)) {
    fail("SPAN_TIME_INVALID", { observed: value.slice(0, 80) });
  }
  const nanos = Number((match[2] ?? "").padEnd(9, "0"));
  return BigInt(baseMs) * 1_000_000n + BigInt(nanos);
}

function durationMs(span) {
  const start = parseTimeNs(span.StartTime);
  const end = parseTimeNs(span.EndTime);
  if (end < start) {
    fail("SPAN_NEGATIVE_DURATION", {
      name: String(span.Name ?? "").slice(0, 200),
    });
  }
  return Number(end - start) / 1_000_000;
}

function normalizedSpan(span) {
  if (!span || typeof span !== "object" || Array.isArray(span)) {
    fail("SPAN_SHAPE_INVALID");
  }
  const name = typeof span.Name === "string" ? span.Name : "";
  if (!name) {
    fail("SPAN_NAME_INVALID");
  }
  return Object.freeze({
    name,
    startTime: span.StartTime,
    endTime: span.EndTime,
    durationMs: Math.round(durationMs(span)),
  });
}

const OPERATIONS = Object.freeze([
  ["totalBuild", (name) => name === "build ."],
  ["sbom", (name) => name.includes("generating sbom using")],
  ["exportToImage", (name) => name === "exporting to image"],
  ["exportLayers", (name) => name === "export layers"],
  [
    "copyPrunerRoot",
    (name) => name.includes("COPY --from=pruner /app /app"),
  ],
  [
    "finalOsPackages",
    (name) => name.includes("apt-get update") && name.includes("ffmpeg"),
  ],
  [
    "innerDependencyInstall",
    (name) =>
      name.includes("RUN bun install --ignore-scripts --frozen-lockfile"),
  ],
  ["workspaceHoist", (name) => name.includes("RUN node - <<'__HOIST__'")],
  ["buildContextLoad", (name) => name === "[internal] load build context"],
  ["repositoryCopy", (name) => name.includes("COPY . .")],
  [
    "manifestAndBom",
    (name) => name.includes("write_alice_runtime_build_manifest.mjs"),
  ],
]);

function maxMatching(spans, predicate) {
  const matches = spans.filter((span) => predicate(span.name));
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((max, current) =>
    current.durationMs > max.durationMs ? current : max,
  );
}

export function buildAliceBuildkitTimingReport({
  otlpText,
  buildRunId = null,
  sourceCommit = null,
}) {
  if (sourceCommit !== null && !/^[a-f0-9]{40}$/.test(sourceCommit)) {
    fail("SOURCE_COMMIT_INVALID", { observed: sourceCommit });
  }
  if (buildRunId !== null && !/^[1-9][0-9]*$/.test(String(buildRunId))) {
    fail("BUILD_RUN_ID_INVALID", { observed: buildRunId });
  }
  const raw = parseConcatenatedJson(otlpText);
  const spans = raw
    .filter((span) => span?.StartTime && span?.EndTime && span?.Name)
    .map(normalizedSpan);
  if (spans.length === 0) {
    fail("NO_TIMED_SPANS");
  }

  const operations = {};
  for (const [id, predicate] of OPERATIONS) {
    const match = maxMatching(spans, predicate);
    operations[id] = match
      ? Object.freeze({ durationMs: match.durationMs, spanName: match.name })
      : null;
  }
  if (!operations.totalBuild) {
    fail("TOTAL_BUILD_SPAN_MISSING");
  }

  const topSpans = [...spans]
    .sort(
      (a, b) =>
        b.durationMs - a.durationMs || a.name.localeCompare(b.name),
    )
    .filter(
      (span, index, all) =>
        index === all.findIndex((candidate) => candidate.name === span.name),
    )
    .slice(0, 30);

  const total = operations.totalBuild.durationMs;
  const percent = (value) =>
    value === null
      ? null
      : Math.round((value.durationMs / total) * 10000) / 100;
  const findings = Object.freeze({
    sbomPercentOfBuild: percent(operations.sbom),
    exportLayersPercentOfBuild: percent(operations.exportLayers),
    copyPrunerRootPercentOfBuild: percent(operations.copyPrunerRoot),
    innerInstallPercentOfBuild: percent(operations.innerDependencyInstall),
    buildContextPercentOfBuild: percent(operations.buildContextLoad),
  });

  const unsigned = Object.freeze({
    schemaVersion: BUILDKIT_TIMING_SCHEMA,
    buildRunId: buildRunId === null ? null : String(buildRunId),
    sourceCommit,
    otlpSha256: sha256(Buffer.from(otlpText, "utf8")),
    spanCount: spans.length,
    totalBuildMs: total,
    operations,
    findings,
    topSpans,
  });
  return Object.freeze({
    ...unsigned,
    reportSha256: sha256(canonicalBytes(unsigned)),
  });
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token: token.slice(0, 120) });
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("CLI_VALUE_MISSING", { name });
    }
    if (values.has(name)) {
      fail("CLI_DUPLICATE_ARGUMENT", { name });
    }
    values.set(name, value);
    index += 1;
  }
  return values;
}

async function main(argv) {
  const values = parseArgs(argv);
  for (const required of ["otlp", "output"]) {
    if (!values.has(required)) {
      fail("CLI_REQUIRED_ARGUMENT_MISSING", { required });
    }
  }
  const otlpText = await readFile(values.get("otlp"), "utf8");
  const report = buildAliceBuildkitTimingReport({
    otlpText,
    buildRunId: values.get("build-run-id") ?? null,
    sourceCommit: values.get("source-commit") ?? null,
  });
  const output = values.get("output");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, canonicalBytes(report), {
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, reportSha256: report.reportSha256, totalBuildMs: report.totalBuildMs })}\n`,
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceBuildkitTimingError) {
      process.stderr.write(
        `${JSON.stringify({ code: error.code, predicateId: error.predicateId, details: error.details })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `${JSON.stringify({ code: "ALICE_BUILDKIT_TIMING_INTERNAL", message: error?.message ?? String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
