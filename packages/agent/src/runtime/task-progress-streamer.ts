/**
 * Posts task-agent status updates back to the originating chat channel.
 *
 * Subscribes to `ptyService.onSessionEvent` and turns the most useful
 * lifecycle events into a small number of human-readable messages so the
 * user is not left staring at silence while a CREATE_TASK runs in the
 * background. Deliberately quiet — never spams per-tool, never edits, just
 * one heartbeat after a long stretch of work plus a final result.
 *
 * UX contract:
 *   - skip immediately after spawn (the action's own ack already covered it)
 *   - one heartbeat per session, only if the agent is still working after
 *     {@link HEARTBEAT_AFTER_MS}
 *   - one final message on `task_complete` containing the agent's URL line
 *     when present, or a short fallback otherwise
 *   - one error message on `error`
 *
 * Lives in milady (not in the shared plugin) because routing back to a
 * specific chat target is deployment-specific — other deployments may not
 * have a discord channel id to write to.
 */

import type { IAgentRuntime, UUID } from "@elizaos/core";
import { logger } from "@elizaos/core";

const HEARTBEAT_AFTER_MS = 45_000;

interface SessionMetadata {
  roomId?: UUID;
  source?: string;
}

interface PTYServiceWithEvents {
  onSessionEvent: (
    cb: (sessionId: string, event: string, data: unknown) => void,
  ) => () => void;
  sessionMetadata?: Map<string, Record<string, unknown>>;
  getSessionOutput?: (sessionId: string, lines?: number) => Promise<string>;
}

interface RuntimeWithMessageTarget extends IAgentRuntime {
  sendMessageToTarget: (
    target: { source?: string; roomId?: UUID; channelId?: string },
    message: { text: string; source?: string },
  ) => Promise<unknown>;
  getRoom: (roomId: UUID) => Promise<{ channelId?: string } | null>;
}

const installedRuntimes = new WeakSet<IAgentRuntime>();

/**
 * Install the streamer once per runtime. Idempotent — repeat calls are no-ops.
 * Returns silently if the PTY service does not expose the event API (e.g.
 * tests, mocked services).
 */
export function installTaskProgressStreamer(
  runtime: IAgentRuntime,
  ptyService: unknown,
): void {
  if (installedRuntimes.has(runtime)) return;
  const svc = ptyService as PTYServiceWithEvents | undefined;
  if (!svc || typeof svc.onSessionEvent !== "function") return;
  installedRuntimes.add(runtime);

  const sessionStartedAt = new Map<string, number>();
  const heartbeatSent = new Set<string>();
  const finalSent = new Set<string>();

  const forgetSession = (sessionId: string): void => {
    sessionStartedAt.delete(sessionId);
    heartbeatSent.delete(sessionId);
    finalSent.delete(sessionId);
  };

  svc.onSessionEvent((sessionId, event) => {
    if (!sessionStartedAt.has(sessionId)) {
      sessionStartedAt.set(sessionId, Date.now());
    }

    if (event === "tool_running" && !heartbeatSent.has(sessionId)) {
      const elapsed = Date.now() - (sessionStartedAt.get(sessionId) ?? 0);
      if (elapsed < HEARTBEAT_AFTER_MS) return;
      heartbeatSent.add(sessionId);
      void postToOriginatingChannel(
        runtime,
        svc,
        sessionId,
        `still working — ${Math.round(elapsed / 1000)}s in, will report when done`,
      );
      return;
    }

    if (event === "task_complete" && !finalSent.has(sessionId)) {
      finalSent.add(sessionId);
      void postFinalReport(runtime, svc, sessionId);
      return;
    }

    if (event === "error" && !finalSent.has(sessionId)) {
      finalSent.add(sessionId);
      void postToOriginatingChannel(
        runtime,
        svc,
        sessionId,
        "task agent errored — check logs",
      );
      return;
    }

    if (event === "stopped") {
      forgetSession(sessionId);
    }
  });
}

async function postFinalReport(
  runtime: IAgentRuntime,
  svc: PTYServiceWithEvents,
  sessionId: string,
): Promise<void> {
  // The action handler's callback expires when CREATE_TASK returns (before
  // the subagent finishes), and the coordinator's chat bridge is suppressed
  // to prevent the "done — <echo>" bug. So this streamer is the ONLY path
  // that delivers the subagent's response to discord. Always post something.
  if (typeof svc.getSessionOutput !== "function") {
    await postToOriginatingChannel(runtime, svc, sessionId, "task finished");
    return;
  }
  let tail: string;
  try {
    tail = await svc.getSessionOutput(sessionId, 1000);
  } catch (err) {
    logger.warn(
      `[task-progress-streamer] could not read session output for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    await postToOriginatingChannel(runtime, svc, sessionId, "task finished");
    return;
  }
  // Try to find a structured URL line first
  const urlLine = tail
    .split("\n")
    .reverse()
    .find((line) => /^\s*URL:\s*https?:\/\//i.test(line));
  if (urlLine) {
    await postToOriginatingChannel(runtime, svc, sessionId, `done — ${urlLine.trim()}`);
    return;
  }
  // No URL line — extract the subagent's last meaningful text from the PTY
  // output. Strip ANSI, empty lines, and claude-code TUI chrome to get the
  // actual answer.
  const lines = tail
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("❯") && !l.startsWith("─"));
  const lastChunk = lines.slice(-15).join("\n");
  const preview =
    lastChunk.length > 1500
      ? `${lastChunk.slice(0, 1500)}...`
      : lastChunk;
  await postToOriginatingChannel(
    runtime,
    svc,
    sessionId,
    preview || "task finished",
  );
}

async function postToOriginatingChannel(
  runtime: IAgentRuntime,
  svc: PTYServiceWithEvents,
  sessionId: string,
  text: string,
): Promise<void> {
  const meta = svc.sessionMetadata?.get(sessionId) as
    | SessionMetadata
    | undefined;
  if (!meta?.roomId) return;
  // milady's roomId is an internal UUID; discord's send handler needs the
  // platform snowflake, which lives on the room record's channelId field.
  const room = await (runtime as RuntimeWithMessageTarget)
    .getRoom(meta.roomId)
    .catch(() => null);
  const channelId = room?.channelId;
  if (!channelId) return;
  const source = meta.source ?? "discord";
  try {
    await (runtime as RuntimeWithMessageTarget).sendMessageToTarget(
      { source, roomId: meta.roomId, channelId },
      { text, source },
    );
  } catch (err) {
    logger.warn(
      `[task-progress-streamer] failed to send update for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
