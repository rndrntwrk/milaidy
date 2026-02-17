#!/usr/bin/env -S node --import tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  verifyEventChain,
} from "../../src/autonomy/workflow/event-integrity.js";
import type { ExecutionEvent } from "../../src/autonomy/workflow/types.js";

function parseArgs(argv: string[]): { eventsFile: string } {
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
  return { eventsFile: resolve(eventsFile) };
}

function parseEvents(raw: string): ExecutionEvent[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed as ExecutionEvent[];
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

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const events = parseEvents(readFileSync(cli.eventsFile, "utf8"));
  const result = verifyEventChain(events);
  if (result.valid) {
    console.log(
      `[event-chain] valid (checked=${result.checkedEvents}, source=${cli.eventsFile})`,
    );
    return;
  }

  console.error(
    `[event-chain] INVALID (checked=${result.checkedEvents}, firstInvalidSequenceId=${result.firstInvalidSequenceId ?? "unknown"}, reason=${result.reason ?? "unknown"})`,
  );
  process.exitCode = 1;
}

void main();
