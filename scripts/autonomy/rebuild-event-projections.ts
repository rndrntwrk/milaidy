#!/usr/bin/env -S node --import tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  rebuildAllRequestProjections,
  type RequestProjection,
} from "../../src/autonomy/workflow/event-projections.js";
import type { ExecutionEvent } from "../../src/autonomy/workflow/types.js";

interface CliArgs {
  eventsFile: string;
  outDir: string;
  label: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const eq = key.indexOf("=");
    if (eq > -1) {
      args.set(key.slice(0, eq), key.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, "true");
  }

  const eventsFile = args.get("events-file");
  if (!eventsFile) {
    throw new Error("Missing required argument: --events-file <path>");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    eventsFile: resolve(eventsFile),
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `projections-${now}`,
  };
}

function parseEvents(raw: string): ExecutionEvent[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as ExecutionEvent[];
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "events" in parsed &&
    Array.isArray((parsed as { events: unknown[] }).events)
  ) {
    return (parsed as { events: ExecutionEvent[] }).events;
  }
  throw new Error("Input must be an event array or an object with an events array");
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  sourceFile: string;
  eventCount: number;
  projections: RequestProjection[];
}): string {
  const lines: string[] = [];
  lines.push("# Event Projection Rebuild Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Source file: \`${input.sourceFile}\``);
  lines.push(`- Event count: \`${input.eventCount}\``);
  lines.push(`- Request projections: \`${input.projections.length}\``);
  lines.push("");
  lines.push("| Request ID | Status | Events | Seq Range | Critical Invariant | Compensation | Unresolved Compensation Incident | Last Error |");
  lines.push("|---|---|---:|---|---|---|---|---|");
  for (const projection of input.projections) {
    lines.push(
      `| ${projection.requestId} | ${projection.status} | ${projection.eventCount} | ${projection.firstSequenceId}-${projection.lastSequenceId} | ${projection.hasCriticalInvariantViolation ? "yes" : "no"} | ${projection.hasCompensation ? "yes" : "no"} | ${projection.hasUnresolvedCompensationIncident ? "yes" : "no"} | ${projection.lastError ?? ""} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const events = parseEvents(readFileSync(cli.eventsFile, "utf8"));
  const projections = rebuildAllRequestProjections(events);

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    sourceFile: cli.eventsFile,
    eventCount: events.length,
    requestCount: projections.length,
    projections,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.event-projections.json`);
  const mdPath = join(cli.outDir, `${cli.label}.event-projections.md`);

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: payload.label,
      createdAt: payload.createdAt,
      sourceFile: payload.sourceFile,
      eventCount: payload.eventCount,
      projections,
    }),
    "utf8",
  );

  console.log(`[projections] wrote ${jsonPath}`);
  console.log(`[projections] wrote ${mdPath}`);
}

void main();
