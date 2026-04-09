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

import { promises as fs } from "node:fs";
import path from "node:path";
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
  getSession?: (sessionId: string) => { workdir?: string } | undefined;
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
  const sessionWorkdirs = new Map<string, string>();
  const sessionRooms = new Map<string, { roomId: UUID; channelId: string; source: string }>();
  const heartbeatSent = new Set<string>();
  const finalSent = new Set<string>();

  const forgetSession = (sessionId: string): void => {
    sessionStartedAt.delete(sessionId);
    sessionWorkdirs.delete(sessionId);
    sessionRooms.delete(sessionId);
    heartbeatSent.delete(sessionId);
    finalSent.delete(sessionId);
  };

  svc.onSessionEvent((sessionId, event) => {
    if (!sessionStartedAt.has(sessionId)) {
      sessionStartedAt.set(sessionId, Date.now());
      // Capture workdir + room routing NOW while the session still exists.
      // Both may be cleaned up before the delayed postFinalReport fires.
      const sess = svc.getSession?.(sessionId);
      if (sess?.workdir) sessionWorkdirs.set(sessionId, sess.workdir);
      const meta = svc.sessionMetadata?.get(sessionId) as SessionMetadata | undefined;
      if (meta?.roomId) {
        void (async () => {
          const room = await (runtime as RuntimeWithMessageTarget)
            .getRoom(meta.roomId!)
            .catch(() => null);
          if (room?.channelId) {
            sessionRooms.set(sessionId, {
              roomId: meta.roomId!,
              channelId: room.channelId,
              source: meta.source ?? "discord",
            });
          }
        })();
      }
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
        sessionRooms,
      );
      return;
    }

    if (event === "task_complete" && !finalSent.has(sessionId)) {
      // task_complete fires after EVERY tool call (when the agent's prompt
      // reappears), not only after the final response. wait a bit for the
      // agent to flush its answer to the session jsonl before reading.
      // if a second task_complete fires within the delay, the finalSent
      // guard prevents duplicate posts.
      // Capture both workdir and room info NOW — the stopped event may fire
      // before the 10s delay and clear the maps via forgetSession.
      const cachedWorkdir = sessionWorkdirs.get(sessionId);
      const cachedRoom = sessionRooms.get(sessionId);
      const snapshotRooms = cachedRoom
        ? new Map([[sessionId, cachedRoom]])
        : sessionRooms;
      setTimeout(() => {
        if (finalSent.has(sessionId)) return;
        finalSent.add(sessionId);
        void postFinalReport(runtime, svc, sessionId, cachedWorkdir, snapshotRooms);
      }, 10_000);
      return;
    }

    if (event === "error" && !finalSent.has(sessionId)) {
      finalSent.add(sessionId);
      void postToOriginatingChannel(
        runtime,
        svc,
        sessionId,
        "task agent errored — check logs",
        sessionRooms,
      );
      return;
    }

    if (event === "stopped") {
      forgetSession(sessionId);
    }
  });
}

/**
 * Read the last assistant text from the subagent's session jsonl.
 * This is the CLEAN source of the subagent's response — no ANSI codes,
 * no TUI chrome, just the structured output claude code produced.
 */
async function readLastAssistantText(
  workdir: string,
): Promise<string | null> {
  // The session jsonl lives under ~/.claude/projects/-<workdir-path-dashed>/
  const home = process.env.HOME ?? "/home/milady";
  // Claude code encodes project paths by replacing both / and . with -.
  // /home/milady/.milady/workspaces/abc → -home-milady--milady-workspaces-abc
  // (the /. in /.milady becomes -- because both chars map to -).
  const projectKey = workdir.replace(/[/.]/g, "-");
  const projectDir = path.join(home, ".claude", "projects", projectKey);
  let files: string[];
  try {
    files = await fs.readdir(projectDir);
  } catch {
    return null;
  }
  const jsonls = files.filter((f) => f.endsWith(".jsonl")).sort();
  if (jsonls.length === 0) return null;
  const jsonlPath = path.join(projectDir, jsonls[jsonls.length - 1]);
  let content: string;
  try {
    content = await fs.readFile(jsonlPath, "utf-8");
  } catch {
    return null;
  }
  // Extract the last assistant text block
  let lastText = "";
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line) as {
        message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
      };
      if (d.message?.role === "assistant") {
        for (const c of d.message.content ?? []) {
          if (c.type === "text" && c.text?.trim()) {
            lastText = c.text.trim();
          }
        }
      }
    } catch {
      continue;
    }
  }
  return lastText || null;
}

async function postFinalReport(
  runtime: IAgentRuntime,
  svc: PTYServiceWithEvents,
  sessionId: string,
  workdir?: string,
  roomCache?: Map<string, { roomId: UUID; channelId: string; source: string }>,
): Promise<void> {
  const assistantText = workdir ? await readLastAssistantText(workdir) : null;
  if (assistantText) {
    const urlLine = assistantText
      .split("\n")
      .find((line) => /^\s*URL:\s*https?:\/\//i.test(line));
    const preview =
      assistantText.length > 1800
        ? `${assistantText.slice(0, 1800)}...`
        : assistantText;
    const text = urlLine ? `done — ${urlLine.trim()}` : preview;
    await postToOriginatingChannel(runtime, svc, sessionId, text, roomCache);
    return;
  }
  await postToOriginatingChannel(runtime, svc, sessionId, "task finished", roomCache);
}

async function postToOriginatingChannel(
  runtime: IAgentRuntime,
  svc: PTYServiceWithEvents,
  sessionId: string,
  text: string,
  roomCache?: Map<string, { roomId: UUID; channelId: string; source: string }>,
): Promise<void> {
  let roomId: UUID | undefined;
  let channelId: string | undefined;
  let source = "discord";
  const cached = roomCache?.get(sessionId);
  if (cached) {
    roomId = cached.roomId;
    channelId = cached.channelId;
    source = cached.source;
  } else {
    const meta = svc.sessionMetadata?.get(sessionId) as SessionMetadata | undefined;
    if (!meta?.roomId) return;
    roomId = meta.roomId;
    source = meta.source ?? "discord";
    const room = await (runtime as RuntimeWithMessageTarget)
      .getRoom(meta.roomId)
      .catch(() => null);
    channelId = room?.channelId;
  }
  if (!roomId || !channelId) return;
  try {
    await (runtime as RuntimeWithMessageTarget).sendMessageToTarget(
      { source, roomId, channelId },
      { text, source },
    );
  } catch (err) {
    logger.warn(
      `[task-progress-streamer] failed to send update for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
