/**
 * Generic streaming infrastructure routes.
 *
 * Shared pipeline for all streaming destinations (custom RTMP, Twitch,
 * YouTube, etc.): capture mode detection, Xvfb management, browser capture,
 * FFmpeg, frame routing, volume/mute.
 *
 * Platform-specific credential fetching lives in destination adapters.
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@elizaos/core";
import type { StreamConfig } from "../services/stream-manager.js";
import {
  readRequestBody,
  readRequestBodyBuffer,
  sendJson,
  sendJsonError,
} from "./http-helpers.js";
import {
  getHeadlessCaptureConfig,
  readStreamSettings,
  seedOverlayDefaults,
  validateStreamSettings,
  writeStreamSettings,
} from "./stream-persistence.js";
import type { StreamRouteState } from "./stream-route-state.js";
import type { StreamingDestination } from "./streaming-types.js";

export type { StreamRouteState } from "./stream-route-state.js";

// ---------------------------------------------------------------------------
// MJPEG frame store — shared state for GET /api/stream/screen
// ---------------------------------------------------------------------------

/**
 * Stores the most-recently received JPEG frame and pushes each new frame
 * to all active MJPEG subscribers (GET /api/stream/screen).
 *
 * Frames arrive via POST /api/stream/frame from:
 *  - Electrobun screencapture module (JS canvas → JPEG)
 *  - Legacy desktop screencapture bridges
 *  - Any client POSTing raw JPEG bytes
 */
const MJPEG_BOUNDARY = "elizaframe";

const mjpegSubscribers = new Set<ServerResponse>();
let latestFrame: Buffer | null = null;

function pushFrameToSubscribers(frame: Buffer): void {
  latestFrame = frame;
  if (mjpegSubscribers.size === 0) return;
  const header = `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
  const headerBuf = Buffer.from(header, "ascii");
  const trailer = Buffer.from("\r\n", "ascii");
  const chunk = Buffer.concat([headerBuf, frame, trailer]);
  const failed: ServerResponse[] = [];
  for (const sub of mjpegSubscribers) {
    try {
      sub.write(chunk);
    } catch {
      failed.push(sub);
    }
  }
  for (const sub of failed) {
    mjpegSubscribers.delete(sub);
  }
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * A streaming destination provides RTMP credentials and optional lifecycle
 * hooks. Canonical definition lives in plugin-streaming-base; re-exported here
 * so existing consumers keep working.
 */
export type {
  OverlayLayoutData,
  StreamingDestination,
} from "./streaming-types.js";

/** Resolve the active streaming destination from the registry. */
export function getActiveDestination(
  state: StreamRouteState,
): StreamingDestination | undefined {
  if (state.activeDestinationId) {
    return state.destinations.get(state.activeDestinationId);
  }
  // Fallback: first destination in map (backward compat for single-destination configs)
  const first = state.destinations.values().next();
  return first.done ? undefined : first.value;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

function error(res: ServerResponse, message: string, status: number): void {
  sendJsonError(res, message, status);
}

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Stream555StatusLike {
  active: boolean;
  cfSessionId?: string;
  cloudflare?: {
    isConnected?: boolean;
    state?: string;
  };
  startTime?: number;
  platforms?: Record<string, { enabled: boolean; status: string; error?: string }>;
  jobStatus?: {
    state?: string;
  };
}

interface Stream555SessionLike {
  sessionId: string;
}

interface Stream555ConfigLike {
  defaultSessionId?: string;
}

interface Stream555ServiceLike {
  getBoundSessionId(): string | null;
  getConfig(): Stream555ConfigLike | null;
  createOrResumeSession(sessionId?: string): Promise<Stream555SessionLike>;
  bindWebSocket(sessionId: string): Promise<void>;
  getStreamStatus(sessionId?: string): Promise<Stream555StatusLike>;
  startStream(
    input: { type: string; url?: string },
    options?: Record<string, unknown>,
    sources?: unknown,
    sessionId?: string,
  ): Promise<unknown>;
  stopStream(sessionId?: string): Promise<unknown>;
  updatePlatform(
    platformId: string,
    config: { rtmpUrl?: string; streamKey?: string; enabled: boolean },
    sessionId?: string,
  ): Promise<unknown>;
  togglePlatform(
    platformId: string,
    enabled: boolean,
    sessionId?: string,
  ): Promise<void>;
}

interface Stream555DestinationMapping {
  platformId: string;
  rtmpUrlEnv: string;
  streamKeyEnv: string;
  enabledEnv: string;
}

const STREAM555_DESTINATION = {
  id: "555stream",
  name: "555 Stream",
} as const;

const STREAM555_DESTINATION_MAPPINGS: Stream555DestinationMapping[] = [
  {
    platformId: "pumpfun",
    rtmpUrlEnv: "STREAM555_DEST_PUMPFUN_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_PUMPFUN_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_PUMPFUN_ENABLED",
  },
  {
    platformId: "x",
    rtmpUrlEnv: "STREAM555_DEST_X_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_X_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_X_ENABLED",
  },
  {
    platformId: "twitch",
    rtmpUrlEnv: "STREAM555_DEST_TWITCH_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_TWITCH_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_TWITCH_ENABLED",
  },
  {
    platformId: "kick",
    rtmpUrlEnv: "STREAM555_DEST_KICK_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_KICK_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_KICK_ENABLED",
  },
  {
    platformId: "youtube",
    rtmpUrlEnv: "STREAM555_DEST_YOUTUBE_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_YOUTUBE_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_YOUTUBE_ENABLED",
  },
  {
    platformId: "facebook",
    rtmpUrlEnv: "STREAM555_DEST_FACEBOOK_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_FACEBOOK_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_FACEBOOK_ENABLED",
  },
  {
    platformId: "custom",
    rtmpUrlEnv: "STREAM555_DEST_CUSTOM_RTMP_URL",
    streamKeyEnv: "STREAM555_DEST_CUSTOM_STREAM_KEY",
    enabledEnv: "STREAM555_DEST_CUSTOM_ENABLED",
  },
];

const DEFAULT_STREAM555_READY_TIMEOUT_MS = 45_000;
const DEFAULT_STREAM555_READY_POLL_MS = 5_000;

function parseStream555Boolean(
  value: string | undefined,
): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseStream555PositiveInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStream555Service(state: StreamRouteState): Stream555ServiceLike | null {
  const candidate = state.runtime?.getService("stream555");
  if (!candidate || typeof candidate !== "object") return null;
  const service = candidate as Partial<Stream555ServiceLike>;
  if (
    typeof service.getStreamStatus !== "function" ||
    typeof service.startStream !== "function" ||
    typeof service.stopStream !== "function"
  ) {
    return null;
  }
  return service as Stream555ServiceLike;
}

function getConfiguredStream555SessionId(
  service: Stream555ServiceLike,
): string | undefined {
  const bound = service.getBoundSessionId()?.trim();
  if (bound) return bound;
  const configured = service.getConfig()?.defaultSessionId?.trim();
  return configured || undefined;
}

async function ensureStream555SessionId(
  service: Stream555ServiceLike,
): Promise<string> {
  const existing = getConfiguredStream555SessionId(service);
  if (existing) {
    if (service.getBoundSessionId()?.trim() !== existing) {
      try {
        await service.bindWebSocket(existing);
      } catch {
        // HTTP status/start calls still work with explicit session ids.
      }
    }
    return existing;
  }

  const created = await service.createOrResumeSession();
  const sessionId = created.sessionId?.trim();
  if (!sessionId) {
    throw new Error("555stream did not return a session id");
  }
  try {
    await service.bindWebSocket(sessionId);
  } catch {
    // Non-fatal for the minimum current-runtime bridge.
  }
  return sessionId;
}

async function applyConfiguredStream555Destinations(
  service: Stream555ServiceLike,
  sessionId: string,
  selectedPlatformIds?: string[],
): Promise<{
  attempted: number;
  enabled: number;
  applied: string[];
  skipped: string[];
  failed: Array<{ platformId: string; error: string }>;
}> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ platformId: string; error: string }> = [];
  let attempted = 0;
  let enabledCount = 0;
  const selectedSet =
    Array.isArray(selectedPlatformIds) && selectedPlatformIds.length > 0
      ? new Set(selectedPlatformIds.map((entry) => entry.trim().toLowerCase()))
      : null;

  for (const mapping of STREAM555_DESTINATION_MAPPINGS) {
    const rtmpUrl = process.env[mapping.rtmpUrlEnv]?.trim();
    const streamKey = process.env[mapping.streamKeyEnv]?.trim();
    const configuredEnabled =
      parseStream555Boolean(process.env[mapping.enabledEnv]) ?? false;
    const enabled = selectedSet
      ? configuredEnabled && selectedSet.has(mapping.platformId)
      : configuredEnabled;
    const hasConfig = Boolean(rtmpUrl) || Boolean(streamKey) || enabled;

    if (!hasConfig) {
      skipped.push(mapping.platformId);
      continue;
    }

    attempted += 1;

    try {
      await service.updatePlatform(
        mapping.platformId,
        {
          ...(rtmpUrl ? { rtmpUrl } : {}),
          ...(streamKey ? { streamKey } : {}),
          enabled,
        },
        sessionId,
      );
      await service.togglePlatform(mapping.platformId, enabled, sessionId);
      applied.push(mapping.platformId);
      if (enabled) enabledCount += 1;
    } catch (err) {
      failed.push({
        platformId: mapping.platformId,
        error: formatErrorMessage(err),
      });
    }
  }

  return {
    attempted,
    enabled: enabledCount,
    applied,
    skipped,
    failed,
  };
}

function mapStream555StatusToHealth(status?: Stream555StatusLike | null): {
  running: boolean;
  ffmpegAlive: boolean;
  uptime: number;
  frameCount: number;
  volume: number;
  muted: boolean;
  audioSource: string;
  inputMode: "screen";
} {
  const running = Boolean(status?.active);
  const jobState = status?.jobStatus?.state?.trim().toLowerCase() ?? "";
  const ffmpegAlive =
    running ||
    (jobState.length > 0 &&
      !/(stopped|failed|error|terminated|offline)/.test(jobState));
  const startTime = status?.startTime;
  const uptime =
    typeof startTime === "number" && Number.isFinite(startTime) && startTime > 0
      ? Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      : 0;

  return {
    running,
    ffmpegAlive,
    uptime,
    frameCount: 0,
    volume: 100,
    muted: false,
    audioSource: "555stream",
    inputMode: "screen",
  };
}

function isStream555Ready(status: Stream555StatusLike): boolean {
  return Boolean(
    status.active && status.cfSessionId && status.cloudflare?.isConnected,
  );
}

async function waitForStream555Readiness(
  service: Stream555ServiceLike,
  sessionId: string,
  timeoutMs = parseStream555PositiveInt(
    "STREAM555_ROUTE_READY_TIMEOUT_MS",
    DEFAULT_STREAM555_READY_TIMEOUT_MS,
  ),
  pollMs = parseStream555PositiveInt(
    "STREAM555_ROUTE_READY_POLL_MS",
    DEFAULT_STREAM555_READY_POLL_MS,
  ),
): Promise<{ ready: boolean; lastStatus?: Stream555StatusLike }> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: Stream555StatusLike | undefined;

  while (Date.now() <= deadline) {
    lastStatus = await service.getStreamStatus(sessionId);
    if (isStream555Ready(lastStatus)) {
      return { ready: true, lastStatus };
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return { ready: false, lastStatus };
}

// ---------------------------------------------------------------------------
// Capture mode detection
// ---------------------------------------------------------------------------

/**
 * Detect the best capture mode for the current environment.
 *
 * Priority:
 * 1. STREAM_MODE env var (explicit override)
 * 2. Desktop screen capture bridge -> "pipe" (POST /api/stream/frame -> FFmpeg stdin)
 * 3. Linux with DISPLAY or Xvfb -> "x11grab" (GPU-backed game-stream approach)
 * 4. macOS -> "avfoundation" (native screen capture)
 * 5. Fallback -> "file" (Puppeteer CDP -> temp JPEG -> FFmpeg)
 */
/** @internal Exported for testing. */
export function detectCaptureMode(): StreamConfig["inputMode"] {
  const explicit = process.env.STREAM_MODE;
  if (explicit === "ui" || explicit === "pipe") return "pipe";
  if (explicit === "x11grab") return "x11grab";
  if (explicit === "avfoundation" || explicit === "screen")
    return "avfoundation";
  if (explicit === "file") return "file";

  // Desktop bridge -> pipe mode
  if ("__elizaScreenCapture" in (globalThis as Record<string, unknown>)) {
    return "pipe";
  }

  // Linux with a display -> x11grab (Xvfb or native X11)
  if (process.platform === "linux" && process.env.DISPLAY) return "x11grab";

  // macOS -> avfoundation screen capture
  if (process.platform === "darwin") return "avfoundation";

  // Fallback -> headless browser capture -> file mode
  return "file";
}

// ---------------------------------------------------------------------------
// Xvfb management
// ---------------------------------------------------------------------------

/**
 * Try to start Xvfb on the specified display if not already running (Linux only).
 * Returns true if display is available, false otherwise.
 */
/** @internal Exported for testing. */
export async function ensureXvfb(
  display: string,
  resolution: string,
): Promise<boolean> {
  if (process.platform !== "linux") return false;

  // Validate display format to prevent command injection (must be :<digits>)
  if (!/^:\d+$/.test(display)) {
    logger.warn(
      `[stream] Invalid display format: ${display} (expected :<number>)`,
    );
    return false;
  }

  // Validate resolution early so callers get a clear failure before we
  // touch the display or spawn processes.
  const [w, h] = resolution.split("x");
  if (!w || !h || !/^\d+$/.test(w) || !/^\d+$/.test(h)) {
    logger.warn(`[stream] Invalid resolution for Xvfb: ${resolution}`);
    return false;
  }

  // Check if the display is already active
  if (process.env.DISPLAY === display) return true;

  try {
    const { execSync } = await import("node:child_process");
    // Check if Xvfb is already running on this display
    try {
      execSync(`xdpyinfo -display ${display}`, {
        stdio: "ignore",
        timeout: 3000,
      });
      logger.info(`[stream] Xvfb already running on display ${display}`);
      return true;
    } catch {
      // Not running -- start it
    }
    const { spawn: spawnProc } = await import("node:child_process");
    const xvfb = spawnProc(
      "Xvfb",
      [display, "-screen", "0", `${w}x${h}x24`, "-ac"],
      {
        stdio: "ignore",
        detached: true,
      },
    );
    xvfb.unref();

    // Wait for Xvfb to be ready
    await new Promise((r) => setTimeout(r, 1000));
    logger.info(`[stream] Started Xvfb on display ${display} (${resolution})`);
    process.env.DISPLAY = display;
    return true;
  } catch (err) {
    logger.warn(`[stream] Failed to start Xvfb: ${err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Streaming pipeline (destination-driven)
// ---------------------------------------------------------------------------

/**
 * Start the full streaming pipeline using the configured destination for
 * RTMP credentials. Handles capture mode detection, Xvfb, browser capture,
 * and FFmpeg configuration.
 */
async function startStreamPipeline(
  state: StreamRouteState,
  rtmpUrl: string,
  rtmpKey: string,
): Promise<{ inputMode: string; audioSource: string }> {
  // Defense-in-depth: validate RTMP scheme before passing to FFmpeg
  if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
    throw new Error("RTMP URL must use rtmp:// or rtmps:// scheme");
  }

  // Seed plugin-default overlay layout on first stream start
  const activeDest = getActiveDestination(state);
  if (activeDest) {
    seedOverlayDefaults(activeDest);
  }
  const destId = activeDest?.id ?? null;

  const mode = detectCaptureMode();

  const audioSource = process.env.STREAM_AUDIO_SOURCE ?? "silent";
  const audioDevice = process.env.STREAM_AUDIO_DEVICE;
  const volume = parseInt(process.env.STREAM_VOLUME ?? "80", 10);
  const resolution = "1280x720";

  const baseConfig: StreamConfig = {
    rtmpUrl,
    rtmpKey,
    resolution,
    bitrate: "1500k",
    audioSource,
    audioDevice,
    volume,
  };

  switch (mode) {
    case "pipe": {
      // Desktop UI mode: FFmpeg reads frames from stdin via writeFrame().
      logger.info("[stream] Capture mode: pipe (desktop UI)");
      await state.streamManager.start({
        ...baseConfig,
        inputMode: "pipe",
        framerate: 15,
      });

      // Auto-start desktop frame capture so the UI is streamed without
      // requiring a manual button click in the renderer.
      if (state.screenCapture && !state.screenCapture.isFrameCaptureActive()) {
        try {
          const captureOpts: {
            fps: number;
            quality: number;
            endpoint: string;
            gameUrl?: string;
          } = {
            fps: 15,
            quality: 70,
            endpoint: "/api/stream/frame",
          };
          if (
            state.activeStreamSource.type !== "stream-tab" &&
            state.activeStreamSource.url
          ) {
            captureOpts.gameUrl = state.activeStreamSource.url;
          }
          await state.screenCapture.startFrameCapture(captureOpts);
          logger.info("[stream] Auto-started desktop frame capture");
        } catch (err) {
          logger.warn(`[stream] Failed to auto-start frame capture: ${err}`);
        }
      } else if (!state.screenCapture) {
        logger.warn(
          "[stream] ScreenCaptureManager not available -- frame capture must be started manually",
        );
      }
      break;
    }

    case "x11grab": {
      // Linux Xvfb mode: capture the virtual display for GPU-backed streams.
      const display =
        process.env.STREAM_DISPLAY ?? ":99";
      logger.info(`[stream] Capture mode: x11grab (display ${display})`);

      // Ensure Xvfb is running
      await ensureXvfb(display, resolution);

      // Launch a browser on the virtual display so there's something to capture
      const captureUrl =
        state.captureUrl ??
        process.env.STREAM_CAPTURE_URL ??
        `http://127.0.0.1:${state.port ?? 2138}`;

      try {
        const { startBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        // Browser capture in x11grab mode just opens the browser on the display --
        // we don't need the frame file since FFmpeg captures the display directly.
        await startBrowserCapture({
          url: captureUrl,
          width: 1280,
          height: 720,
          quality: 70,
          ...getHeadlessCaptureConfig(destId),
        });
      } catch (err) {
        logger.warn(`[stream] Browser launch on ${display} failed: ${err}`);
      }

      await state.streamManager.start({
        ...baseConfig,
        inputMode: "x11grab",
        display,
        framerate: 30,
      });
      break;
    }

    case "avfoundation": {
      // macOS native screen capture.
      const videoDevice =
        process.env.STREAM_VIDEO_DEVICE ?? "3";
      logger.info(
        `[stream] Capture mode: avfoundation (device ${videoDevice})`,
      );
      await state.streamManager.start({
        ...baseConfig,
        inputMode: "avfoundation",
        videoDevice,
        framerate: 30,
      });
      break;
    }

    default: {
      // Headless browser capture -> temp JPEG file -> FFmpeg file mode.
      const captureUrl =
        state.captureUrl ??
        process.env.STREAM_CAPTURE_URL ??
        `http://127.0.0.1:${state.port ?? 2138}`;

      logger.info(
        `[stream] Capture mode: file (browser capture -> ${captureUrl})`,
      );

      const { startBrowserCapture, FRAME_FILE } = await import(
        "../services/browser-capture.js"
      );
      try {
        await startBrowserCapture({
          url: captureUrl,
          width: 1280,
          height: 720,
          quality: 70,
          ...getHeadlessCaptureConfig(destId),
        });
        // Wait for first frame file to be written
        await new Promise((resolve) => {
          const check = setInterval(() => {
            try {
              if (
                fs.existsSync(FRAME_FILE) &&
                fs.statSync(FRAME_FILE).size > 0
              ) {
                clearInterval(check);
                resolve(true);
              }
            } catch {
              // Frame file not yet ready -- poll again
            }
          }, 200);
          setTimeout(() => {
            clearInterval(check);
            resolve(false);
          }, 10_000);
        });
      } catch (captureErr) {
        logger.warn(`[stream] Browser capture failed: ${captureErr}`);
      }

      await state.streamManager.start({
        ...baseConfig,
        inputMode: "file",
        frameFile: FRAME_FILE,
        framerate: 30,
      });
      break;
    }
  }

  return { inputMode: mode || "file", audioSource };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** Returns `true` if handled, `false` to fall through. */
export async function handleStreamRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: StreamRouteState,
): Promise<boolean> {
  // Fast-path: skip if not a stream route
  if (
    !pathname.startsWith("/api/stream/") &&
    !pathname.startsWith("/api/streaming/")
  ) {
    return false;
  }

  // ── POST /api/stream/frame -- pipe frames to StreamManager + MJPEG ──
  if (method === "POST" && pathname === "/api/stream/frame") {
    try {
      const buf = await readRequestBodyBuffer(req, {
        maxBytes: 2 * 1024 * 1024,
      });
      if (!buf || buf.length === 0) {
        error(res, "Empty frame", 400);
        return true;
      }
      // Always store frame for MJPEG monitoring (GET /api/stream/screen)
      pushFrameToSubscribers(buf);
      // Write to FFmpeg only when RTMP streaming is active
      if (state.streamManager.isRunning()) {
        state.streamManager.writeFrame(buf);
      }
      res.writeHead(200);
      res.end();
    } catch {
      error(res, "Frame write failed", 500);
    }
    return true;
  }

  // ── GET /api/stream/screen -- MJPEG live view (local + remote agents) ─
  // Serves a continuous multipart/x-mixed-replace stream of JPEG frames.
  // Works independently of RTMP streaming — frames arrive via POST /api/stream/frame.
  // Usage: <img src="http://agent-host:2138/api/stream/screen" />
  if (method === "GET" && pathname === "/api/stream/screen") {
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
      "Cache-Control": "no-store, no-cache",
      Connection: "close",
      "Access-Control-Allow-Origin": "*",
    });

    mjpegSubscribers.add(res);

    // Send the latest cached frame immediately so there's no blank wait
    if (latestFrame) {
      const header = `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.length}\r\n\r\n`;
      res.write(
        Buffer.concat([
          Buffer.from(header, "ascii"),
          latestFrame,
          Buffer.from("\r\n", "ascii"),
        ]),
      );
    }

    const cleanup = () => {
      mjpegSubscribers.delete(res);
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    // Keep the response open — frames are pushed as they arrive
    return true;
  }

  // ── POST /api/stream/live -- start stream via destination ────────────
  if (method === "POST" && pathname === "/api/stream/live") {
    const stream555 = getStream555Service(state);
    if (stream555) {
      try {
        const rawBody = await readRequestBody(req);
        const parsedBody =
          typeof rawBody === "string" && rawBody.trim().length > 0
            ? JSON.parse(rawBody)
            : rawBody;
        const requestedDestinationIds = Array.isArray(parsedBody?.destinationIds)
          ? parsedBody.destinationIds
              .map((value: unknown) =>
                typeof value === "string" ? value.trim().toLowerCase() : "",
              )
              .filter((value: string) => value.length > 0)
          : undefined;
        const sceneId =
          typeof parsedBody?.sceneId === "string" &&
          parsedBody.sceneId.trim().length > 0
            ? parsedBody.sceneId.trim()
            : "default";

        const existingSessionId = getConfiguredStream555SessionId(stream555);
        if (existingSessionId) {
          try {
            const existingStatus = await stream555.getStreamStatus(
              existingSessionId,
            );
            if (existingStatus.active) {
              json(res, {
                ok: true,
                live: true,
                message: "Already streaming",
                ...mapStream555StatusToHealth(existingStatus),
                destination: STREAM555_DESTINATION.id,
              });
              return true;
            }
          } catch (err) {
            logger.warn(
              `[stream] 555stream preflight status failed: ${formatErrorMessage(
                err,
              )}`,
            );
          }
        }

        const sessionId = await ensureStream555SessionId(stream555);
        const destinationSync = await applyConfiguredStream555Destinations(
          stream555,
          sessionId,
          requestedDestinationIds,
        );
        if (destinationSync.failed.length > 0) {
          error(
            res,
            `555stream destination sync failed for ${destinationSync.failed.length} platform(s)`,
            500,
          );
          return true;
        }
        if (destinationSync.enabled === 0) {
          error(res, "No 555stream destinations enabled", 400);
          return true;
        }

        await stream555.startStream(
          { type: "screen" },
          { scene: sceneId },
          undefined,
          sessionId,
        );
        const readiness = await waitForStream555Readiness(
          stream555,
          sessionId,
        );
        if (!readiness.ready) {
          try {
            await stream555.stopStream(sessionId);
          } catch {
            // Best-effort cleanup after failed readiness.
          }
          error(
            res,
            "555stream did not reach ready state before timeout",
            502,
          );
          return true;
        }

        json(res, {
          ok: true,
          live: true,
          sessionId,
          ...mapStream555StatusToHealth(readiness.lastStatus),
          destination: STREAM555_DESTINATION.id,
        });
      } catch (err) {
        error(res, formatErrorMessage(err), 500);
      }
      return true;
    }

    if (state.streamManager.isRunning()) {
      const health = state.streamManager.getHealth();
      json(res, {
        ok: true,
        live: true,
        message: "Already streaming",
        ...health,
      });
      return true;
    }

    const dest = getActiveDestination(state);
    if (!dest) {
      error(res, "No streaming destination configured", 400);
      return true;
    }

    try {
      const { rtmpUrl, rtmpKey } = await dest.getCredentials();
      const { inputMode, audioSource } = await startStreamPipeline(
        state,
        rtmpUrl,
        rtmpKey,
      );
      await dest.onStreamStart?.();
      json(res, {
        ok: true,
        live: true,
        rtmpUrl,
        inputMode,
        audioSource,
        destination: dest.id,
      });
    } catch (err) {
      error(res, formatErrorMessage(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/offline -- stop stream + notify destination ─────
  if (method === "POST" && pathname === "/api/stream/offline") {
    const stream555 = getStream555Service(state);
    if (stream555) {
      try {
        const sessionId = getConfiguredStream555SessionId(stream555);
        if (!sessionId) {
          json(res, { ok: true, live: false });
          return true;
        }
        await stream555.stopStream(sessionId);
        json(res, { ok: true, live: false });
      } catch (err) {
        error(res, formatErrorMessage(err), 500);
      }
      return true;
    }

    try {
      // Stop browser capture
      try {
        const { stopBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        await stopBrowserCapture();
      } catch {
        // Browser capture may not have been started -- ignore
      }
      // Stop StreamManager
      if (state.streamManager.isRunning()) {
        await state.streamManager.stop();
      }
      // Notify destination
      try {
        await getActiveDestination(state)?.onStreamStop?.();
      } catch {
        // Destination notification failure is non-fatal
      }
      json(res, { ok: true, live: false });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/start -- backward-compat explicit RTMP start ────
  if (method === "POST" && pathname === "/api/stream/start") {
    try {
      const bodyStr = await readRequestBody(req);
      const body = typeof bodyStr === "string" ? JSON.parse(bodyStr) : bodyStr;
      const rtmpUrl = body?.rtmpUrl as string | undefined;
      const rtmpKey = body?.rtmpKey as string | undefined;

      if (!rtmpUrl || !rtmpKey) {
        error(res, "rtmpUrl and rtmpKey are required", 400);
        return true;
      }

      if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
        error(res, "rtmpUrl must use rtmp:// or rtmps:// scheme", 400);
        return true;
      }

      // Validate FFmpeg parameters to prevent filter expression injection
      const VALID_INPUT_MODES = ["testsrc", "avfoundation", "pipe"] as const;
      const inputMode = body?.inputMode ?? "testsrc";
      if (!VALID_INPUT_MODES.includes(inputMode)) {
        error(
          res,
          `inputMode must be one of: ${VALID_INPUT_MODES.join(", ")}`,
          400,
        );
        return true;
      }

      const resolution = (body?.resolution as string) || "1280x720";
      if (!/^\d{3,4}x\d{3,4}$/.test(resolution)) {
        error(res, "resolution must match WIDTHxHEIGHT (e.g. 1280x720)", 400);
        return true;
      }

      const bitrate = (body?.bitrate as string) || "2500k";
      if (!/^\d+k$/.test(bitrate)) {
        error(res, "bitrate must match NUMBERk (e.g. 2500k)", 400);
        return true;
      }

      const framerate = body?.framerate ?? 30;
      if (
        typeof framerate !== "number" ||
        !Number.isInteger(framerate) ||
        framerate < 1 ||
        framerate > 60
      ) {
        error(res, "framerate must be an integer between 1 and 60", 400);
        return true;
      }

      await state.streamManager.start({
        rtmpUrl,
        rtmpKey,
        inputMode,
        resolution,
        bitrate,
        framerate,
      });

      json(res, { ok: true, message: "Stream started" });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/stop -- backward-compat explicit stop ───────────
  if (method === "POST" && pathname === "/api/stream/stop") {
    try {
      const result = await state.streamManager.stop();
      json(res, { ok: true, ...result });
    } catch (err) {
      error(res, formatErrorMessage(err), 500);
    }
    return true;
  }

  // ── GET /api/stream/status -- local stream health ────────────────────
  if (method === "GET" && pathname === "/api/stream/status") {
    const stream555 = getStream555Service(state);
    if (stream555) {
      const sessionId = getConfiguredStream555SessionId(stream555);
      if (!sessionId) {
        json(res, {
          ok: true,
          ...mapStream555StatusToHealth(null),
          destination: STREAM555_DESTINATION,
        });
        return true;
      }
      try {
        const status = await stream555.getStreamStatus(sessionId);
        json(res, {
          ok: true,
          ...mapStream555StatusToHealth(status),
          destination: STREAM555_DESTINATION,
        });
      } catch (err) {
        logger.warn(
          `[stream] 555stream status fallbacking to inactive payload: ${formatErrorMessage(
            err,
          )}`,
        );
        json(res, {
          ok: true,
          ...mapStream555StatusToHealth(null),
          destination: STREAM555_DESTINATION,
        });
      }
      return true;
    }

    const health = state.streamManager.getHealth();
    const activeDest = getActiveDestination(state);
    const destInfo = activeDest
      ? { id: activeDest.id, name: activeDest.name }
      : null;
    json(res, { ok: true, ...health, destination: destInfo });
    return true;
  }

  // ── POST /api/stream/volume -- set stream volume (0-100) ─────────────
  if (method === "POST" && pathname === "/api/stream/volume") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const level = parsed?.volume;
      if (
        typeof level !== "number" ||
        !Number.isFinite(level) ||
        level < 0 ||
        level > 100
      ) {
        error(res, "volume must be a number between 0 and 100", 400);
        return true;
      }
      await state.streamManager.setVolume(level);
      json(res, {
        ok: true,
        volume: state.streamManager.getVolume(),
        muted: state.streamManager.isMuted(),
      });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/mute -- mute stream audio ──────────────────────
  if (method === "POST" && pathname === "/api/stream/mute") {
    try {
      await state.streamManager.mute();
      json(res, {
        ok: true,
        muted: true,
        volume: state.streamManager.getVolume(),
      });
    } catch (err) {
      error(res, formatErrorMessage(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/unmute -- unmute stream audio ───────────────────
  if (method === "POST" && pathname === "/api/stream/unmute") {
    try {
      await state.streamManager.unmute();
      json(res, {
        ok: true,
        muted: false,
        volume: state.streamManager.getVolume(),
      });
    } catch (err) {
      error(res, formatErrorMessage(err), 500);
    }
    return true;
  }

  // ── GET /api/streaming/destinations -- list configured destination ───
  if (method === "GET" && pathname === "/api/streaming/destinations") {
    const destinations = Array.from(state.destinations.values()).map((d) => ({
      id: d.id,
      name: d.name,
      active:
        d.id ===
        (state.activeDestinationId ?? state.destinations.keys().next().value),
    }));
    json(res, { ok: true, destinations });
    return true;
  }

  // ── POST /api/streaming/destination -- set active destination ────────
  if (method === "POST" && pathname === "/api/streaming/destination") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const destinationId = parsed?.destinationId as string | undefined;
      if (!destinationId) {
        error(res, "destinationId is required", 400);
        return true;
      }
      const target = state.destinations.get(destinationId);
      if (target) {
        state.activeDestinationId = destinationId;
        json(res, {
          ok: true,
          destination: { id: target.id, name: target.name },
        });
      } else {
        error(res, `Unknown destination: ${destinationId}`, 404);
      }
    } catch (err) {
      error(res, formatErrorMessage(err), 500);
    }
    return true;
  }

  // ── GET /api/stream/settings -- read stream visual settings ───────────
  if (method === "GET" && pathname === "/api/stream/settings") {
    try {
      const settings = readStreamSettings();
      json(res, { ok: true, settings });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  // ── POST /api/stream/settings -- save stream visual settings ──────────
  if (method === "POST" && pathname === "/api/stream/settings") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const result = validateStreamSettings(parsed?.settings);
      if (result.error || !result.settings) {
        error(res, result.error ?? "Invalid settings", 400);
        return true;
      }
      // Merge with existing settings so partial updates (e.g. just avatarIndex)
      // don't wipe other fields (e.g. voice config).
      const existing = readStreamSettings();
      const merged = { ...existing, ...result.settings };
      writeStreamSettings(merged);
      if (
        typeof merged.avatarIndex === "number" &&
        Number.isFinite(merged.avatarIndex)
      ) {
        try {
          state.mirrorStreamAvatarToElizaConfig?.(merged.avatarIndex);
        } catch (err) {
          logger.warn(
            `[stream] mirrorStreamAvatarToElizaConfig failed (stream settings still saved): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      json(res, { ok: true, settings: merged });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  // ── GET /api/stream/source -- get active stream source ───────────────
  if (method === "GET" && pathname === "/api/stream/source") {
    json(res, { source: state.activeStreamSource });
    return true;
  }

  // ── POST /api/stream/source -- set active stream source ──────────────
  if (method === "POST" && pathname === "/api/stream/source") {
    try {
      const body = await readRequestBody(req);
      const { sourceType, customUrl } = JSON.parse(
        typeof body === "string" ? body : JSON.stringify(body),
      );

      if (!["stream-tab", "game", "custom-url"].includes(sourceType)) {
        error(res, "Invalid sourceType", 400);
        return true;
      }
      if (sourceType === "custom-url" && !customUrl) {
        error(res, "customUrl required for custom-url source", 400);
        return true;
      }
      if (sourceType === "game" && !customUrl) {
        error(res, "customUrl required for game source", 400);
        return true;
      }

      // Validate URL scheme to prevent file:// or javascript: URI injection.
      // Only http/https are permitted as capture targets.
      if (
        (sourceType === "game" || sourceType === "custom-url") &&
        customUrl &&
        !/^https?:\/\//i.test(customUrl)
      ) {
        error(res, "customUrl must use http:// or https:// scheme", 400);
        return true;
      }

      // Stop current frame capture if active
      if (state.screenCapture?.isFrameCaptureActive()) {
        state.screenCapture.stopFrameCapture?.();
      }

      // Build capture options
      const captureOpts: {
        fps: number;
        quality: number;
        endpoint: string;
        gameUrl?: string;
      } = {
        fps: 15,
        quality: 70,
        endpoint: "/api/stream/frame",
      };

      if (sourceType === "game" || sourceType === "custom-url") {
        captureOpts.gameUrl = customUrl;
      }

      // Update state
      state.activeStreamSource = { type: sourceType, url: customUrl };

      // Restart frame capture if stream is running
      if (state.streamManager.isRunning() && state.screenCapture) {
        try {
          await state.screenCapture.startFrameCapture(captureOpts);
        } catch (err) {
          logger.warn(
            `[stream] Failed to restart frame capture after source switch: ${err}`,
          );
        }
      }

      json(res, { ok: true, source: state.activeStreamSource });
    } catch (err) {
      error(res, String(err), 500);
    }
    return true;
  }

  return false;
}
