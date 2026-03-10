import type {
  Five55AutonomyMode,
  Five55AutonomyPreviewResponse,
} from "./api-client.js";
import type { ParsedToolEnvelope } from "./components/quickLayerPlan.js";

export const DEFAULT_GAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-forms";

export type ParsedGameLaunch = {
  gameId: string;
  gameTitle: string;
  viewerUrl: string;
  sandbox?: string;
  postMessageAuth: boolean;
};

export function summarizeStreamState(
  envelope: ParsedToolEnvelope | null,
): { live: boolean; label: string } {
  const data = envelope?.data;
  if (!data) return { live: false, label: "unknown" };

  const rawState =
    typeof data.state === "string"
      ? data.state
      : typeof data.phase === "string"
        ? data.phase
        : typeof data.status === "string"
          ? data.status
          : undefined;
  const normalizedState = rawState?.trim().toLowerCase() ?? "";
  const live =
    data.active === true ||
    data.isLive === true ||
    normalizedState === "live" ||
    normalizedState === "playing" ||
    normalizedState === "streaming" ||
    normalizedState === "on_air";
  return { live, label: rawState ?? (live ? "live" : "unknown") };
}

export function parseAdIdFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): string | undefined {
  const data = envelope?.data;
  if (!data || typeof data !== "object") return undefined;
  const ad =
    data.ad && typeof data.ad === "object" && !Array.isArray(data.ad)
      ? (data.ad as Record<string, unknown>)
      : null;
  return ad && typeof ad.id === "string" && ad.id.trim().length > 0
    ? ad.id.trim()
    : undefined;
}

export function parseProjectedEarningsFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): number | null {
  const data = envelope?.data;
  if (!data || typeof data !== "object") return null;
  const evaluated = Array.isArray(data.evaluated) ? data.evaluated : [];
  let maxPayout = 0;
  for (const entry of evaluated) {
    if (!entry || typeof entry !== "object") continue;
    const payout = Number((entry as Record<string, unknown>).payoutPerImpression ?? 0);
    if (Number.isFinite(payout) && payout > maxPayout) {
      maxPayout = payout;
    }
  }
  return Number.isFinite(maxPayout) ? maxPayout : null;
}

function isLoopbackHostname(hostname: string | null | undefined): boolean {
  const normalized =
    typeof hostname === "string"
      ? hostname
          .trim()
          .toLowerCase()
          .replace(/^\[|\]$/g, "")
      : "";
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "::1") return true;
  if (normalized === "0.0.0.0") return true;
  if (normalized === "::ffff:127.0.0.1") return true;
  return normalized.startsWith("127.");
}

export function isLoopbackUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function isUnreachableLoopbackViewerUrl(rawUrl: string): boolean {
  if (!isLoopbackUrl(rawUrl)) return false;
  if (typeof window === "undefined") return true;
  return !isLoopbackHostname(window.location.hostname);
}

export function parseGameLaunchFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): ParsedGameLaunch | null {
  const data = envelope?.data;
  if (!data) return null;

  const game =
    data.game && typeof data.game === "object" && !Array.isArray(data.game)
      ? (data.game as Record<string, unknown>)
      : null;
  const viewer =
    data.viewer && typeof data.viewer === "object" && !Array.isArray(data.viewer)
      ? (data.viewer as Record<string, unknown>)
      : null;

  const viewerUrl =
    (viewer && typeof viewer.url === "string" ? viewer.url : undefined) ??
    (typeof data.launchUrl === "string" ? data.launchUrl : undefined);
  const normalizedViewerUrl = viewerUrl?.trim();
  if (!normalizedViewerUrl) return null;
  if (isLoopbackUrl(normalizedViewerUrl)) return null;

  const gameId =
    (game && typeof game.id === "string" ? game.id : undefined) ??
    "unknown-game";
  const gameTitle =
    (game && typeof game.title === "string" ? game.title : undefined) ?? gameId;
  const sandbox =
    viewer && typeof viewer.sandbox === "string" ? viewer.sandbox : undefined;
  const postMessageAuth =
    viewer && typeof viewer.postMessageAuth === "boolean"
      ? viewer.postMessageAuth
      : false;

  return {
    gameId,
    gameTitle,
    viewerUrl: normalizedViewerUrl,
    sandbox,
    postMessageAuth,
  };
}

export function selectPreferredGameId(
  games: Array<{ id: string; category?: string }>,
): string | undefined {
  const preferredOrder = [
    "ninja-evilcorp",
    "drive",
    "wolf-and-sheep",
    "pixel-copter",
  ];
  for (const preferredId of preferredOrder) {
    const hit = games.find((game) => game.id === preferredId);
    if (hit) return hit.id;
  }

  const nonCasino = games.find((game) => game.category !== "casino");
  return nonCasino?.id ?? games[0]?.id;
}

export function buildAutonomousPrompt(params: {
  mode: Five55AutonomyMode;
  topic: string;
  durationMin: number;
  gameTitle?: string;
}): string {
  const { mode, topic, durationMin, gameTitle } = params;
  const timingInstruction =
    `Operate autonomously for ${durationMin} minutes, then wrap up naturally and stop the stream.`;

  if (mode === "newscast") {
    return [
      "Run an autonomous live newscast.",
      "Cover recent events with concise segments, clear transitions, and factual framing.",
      timingInstruction,
    ].join(" ");
  }
  if (mode === "topic") {
    const focus = topic.trim() || "the selected topic";
    return [
      `Run an autonomous live topic deep dive on ${focus}.`,
      "Structure it into intro, key points, examples, and closing recap.",
      timingInstruction,
    ].join(" ");
  }
  if (mode === "games") {
    const target = gameTitle?.trim() || "the active game";
    return [
      `Run an autonomous live gameplay session for ${target}.`,
      "Keep live commentary focused on tactics, score progression, and key turning points.",
      timingInstruction,
    ].join(" ");
  }
  return [
    "Run an autonomous live free-form session.",
    "Choose engaging segments dynamically while maintaining coherent pacing.",
    timingInstruction,
  ].join(" ");
}

export function summarizeAutonomousCredits(
  preview: Five55AutonomyPreviewResponse | null,
): string | null {
  if (!preview) return null;
  const credits = preview.estimate?.grandTotalCredits;
  return typeof credits === "number" ? `${credits}` : null;
}
