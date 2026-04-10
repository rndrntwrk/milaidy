/**
 * Watches the Claude Code session jsonl for each active PTY session and
 * emits a synthetic `task_complete` event when the agent produces an
 * assistant message with `stop_reason === "end_turn"`. This is the
 * ground-truth completion signal from Claude Code's own session record —
 * independent of PTY buffer state, TUI ready events, or the stall
 * classifier's buffer-text heuristics.
 *
 * ## Why this exists
 *
 * The orchestrator's historical completion detection leaned on PTY-side
 * heuristics (buffer silence + ready event + stall-classifier LLM), all of
 * which misfire for long open-ended tasks. Claude Code's own hooks are a
 * more reliable signal and remain the primary path, but hooks can fail
 * silently if the user's hook config is broken or a future Claude Code
 * release changes the contract. The jsonl is a durable, parseable record
 * of every turn written by the CLI itself — using it as an additional
 * ground truth makes completion detection robust across those failure
 * modes.
 *
 * ## Dedup contract with the hook path
 *
 * pty-service.handleHookEvent emits `task_complete` on the authoritative
 * hook signal. This watcher emits a synthetic `task_complete` with an
 * `internal: { source: "jsonl-watcher" }` marker. The orchestrator's
 * downstream consumers (coordinator's handleTurnComplete, the milady
 * task-progress-streamer) already dedupe `task_complete` per session
 * (`finalSent` in the streamer, `inFlightDecisions` in the coordinator).
 * Whichever signal fires first wins; the second is a no-op.
 *
 * ## Polling vs fs.watch
 *
 * This uses polling (1s interval) rather than `fs.watch` because:
 *   - jsonl files are append-only and small (~KB to MB)
 *   - polling is portable across linux / macOS file systems
 *   - fs.watch on linux has known gotchas with multiple writers and with
 *     files created after the watcher is established
 *   - the jsonl doesn't exist when the session spawns — we need retry
 *     logic anyway, which fs.watch doesn't naturally provide
 *
 * @module runtime/claude-jsonl-completion-watcher
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";

const POLL_INTERVAL_MS = 1_000;

interface AssistantLine {
  message?: {
    role?: string;
    stop_reason?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

interface PTYServiceWithEvents {
  onSessionEvent: (
    cb: (sessionId: string, event: string, data: unknown) => void,
  ) => () => void;
  sessionMetadata?: Map<string, Record<string, unknown>>;
  getSession?: (sessionId: string) => { workdir?: string } | undefined;
  handleHookEvent?: (
    sessionId: string,
    event: string,
    data: Record<string, unknown>,
  ) => void;
}

const installedRuntimes = new WeakSet<IAgentRuntime>();

/**
 * Install the jsonl completion watcher on a runtime's PTY service.
 * Idempotent — repeat calls on the same runtime are no-ops.
 *
 * The watcher subscribes to `onSessionEvent` to learn when sessions start
 * (first event) and stop (`stopped` event), and runs one poller per live
 * session. Pollers tear themselves down on `stopped` or after firing a
 * completion event.
 */
export function installClaudeJsonlCompletionWatcher(
  runtime: IAgentRuntime,
  ptyService: unknown,
): void {
  if (installedRuntimes.has(runtime)) return;
  const svc = ptyService as PTYServiceWithEvents | undefined;
  if (!svc || typeof svc.onSessionEvent !== "function") return;
  installedRuntimes.add(runtime);

  const pollers = new Map<string, Poller>();

  const startIfMissing = (sessionId: string): void => {
    if (pollers.has(sessionId)) return;
    const workdir = svc.getSession?.(sessionId)?.workdir;
    if (!workdir) return;
    const poller = new Poller(svc, sessionId, workdir);
    pollers.set(sessionId, poller);
    poller.start();
  };

  const stop = (sessionId: string): void => {
    const poller = pollers.get(sessionId);
    if (!poller) return;
    poller.stop();
    pollers.delete(sessionId);
  };

  svc.onSessionEvent((sessionId, event) => {
    // Any first event for a sessionId is our cue to start polling. We
    // deliberately do NOT gate on a particular event type — the jsonl may
    // be written before the first PTY event arrives, and we want the
    // poller alive as early as possible.
    startIfMissing(sessionId);

    if (event === "stopped" || event === "error") {
      stop(sessionId);
    }
    if (event === "task_complete") {
      // Hook path already fired — no need for jsonl fallback. Shut down
      // the poller to avoid a later duplicate synthetic emission.
      stop(sessionId);
    }
  });
}

/**
 * One poller per session. Owns its own interval, its own `fired` guard,
 * and its own cached file size so it only re-reads when the jsonl grows.
 */
class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private fired = false;
  private lastSize = 0;

  constructor(
    private readonly svc: PTYServiceWithEvents,
    private readonly sessionId: string,
    private readonly workdir: string,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.fired) return;
    const jsonlPath = await findLatestJsonl(this.workdir);
    if (!jsonlPath) return;
    let stat: { size: number };
    try {
      stat = await fs.stat(jsonlPath);
    } catch {
      return;
    }
    if (stat.size === this.lastSize) return;
    this.lastSize = stat.size;

    let content: string;
    try {
      content = await fs.readFile(jsonlPath, "utf-8");
    } catch {
      return;
    }

    const done = findLatestEndTurn(content);
    if (!done) return;

    this.fired = true;
    this.stop();
    logger.info(
      `[claude-jsonl-watcher] detected end_turn for ${this.sessionId} — emitting synthetic task_complete (${done.text.length} chars)`,
    );
    // Route through the same handleHookEvent pathway the real hook uses,
    // so downstream consumers receive an identical event shape and the
    // existing dedup guards apply transparently.
    this.svc.handleHookEvent?.(this.sessionId, "task_complete", {
      response: done.text,
      source: "jsonl-watcher",
    });
  }
}

/**
 * Locate the newest `.jsonl` file under Claude Code's project directory
 * for a given workdir. Returns null if the directory or any matching
 * file does not yet exist (e.g., the session has not produced output).
 *
 * Exported for tests.
 */
export async function findLatestJsonl(
  workdir: string,
): Promise<string | null> {
  const home = process.env.HOME ?? os.homedir();
  // Claude Code encodes project paths by replacing both `/` and `.` with
  // `-`. For example:
  //   /home/milady/.milady/workspaces/abc → -home-milady--milady-workspaces-abc
  // (the `/.` in `/.milady` maps to `--`).
  const projectKey = workdir.replace(/[/.]/g, "-");
  const projectDir = path.join(home, ".claude", "projects", projectKey);
  let entries: string[];
  try {
    entries = await fs.readdir(projectDir);
  } catch {
    return null;
  }
  const jsonls = entries.filter((f) => f.endsWith(".jsonl")).sort();
  if (jsonls.length === 0) return null;
  return path.join(projectDir, jsonls[jsonls.length - 1]);
}

/**
 * Scan a jsonl string for the latest assistant line with
 * `stop_reason === "end_turn"` and return its extracted text. Returns null
 * if the latest assistant message does not have `end_turn` (meaning the
 * agent is still in a tool_use turn or has not yet produced any assistant
 * output), or if no assistant message exists at all.
 *
 * Walks the file tail-first for efficiency and to handle the rare case of
 * replayed / edited sessions where an earlier assistant message might have
 * had `end_turn` that was superseded by later activity.
 *
 * Exported for tests.
 */
export function findLatestEndTurn(
  content: string,
): { text: string; stopReason: string } | null {
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: AssistantLine;
    try {
      parsed = JSON.parse(line) as AssistantLine;
    } catch {
      continue;
    }
    const msg = parsed.message;
    if (!msg || msg.role !== "assistant") continue;
    // Latest assistant line wins — if its stop_reason isn't end_turn, the
    // agent is still working (tool_use, max_tokens mid-batch, etc.).
    if (msg.stop_reason !== "end_turn") return null;
    let text = "";
    for (const c of msg.content ?? []) {
      if (c.type === "text" && typeof c.text === "string" && c.text.trim()) {
        text = c.text.trim();
      }
    }
    return { text, stopReason: "end_turn" };
  }
  return null;
}
