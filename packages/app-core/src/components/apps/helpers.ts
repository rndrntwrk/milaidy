import type { RegistryAppInfo } from "../../api";

export const DEFAULT_VIEWER_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

const PROD_ALLOWED_APPS = new Set(["@iqlabs-official/plugin-clawbal"]);

export const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
  utility: "Utility",
};

const SESSION_MODE_LABELS: Record<string, string> = {
  "spectate-and-steer": "Spectate + steer",
};

const SESSION_FEATURE_LABELS: Record<string, string> = {
  commands: "Commands",
  telemetry: "Telemetry",
  pause: "Pause",
  resume: "Resume",
  suggestions: "Suggestions",
};

export function shouldShowAppInAppsView(
  app: Pick<RegistryAppInfo, "name">,
  isProd: boolean = typeof import.meta.env.PROD === "boolean"
    ? import.meta.env.PROD
    : Boolean(import.meta.env.PROD),
): boolean {
  if (!isProd) return true;
  return PROD_ALLOWED_APPS.has(app.name);
}

export function getAppShortName(app: RegistryAppInfo): string {
  const display = app.displayName ?? app.name;
  const clean = display.replace(/^@[^/]+\/app-/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function getAppEmoji(app: RegistryAppInfo): string {
  const name = (app.name ?? "").toLowerCase();
  if (name.includes("hyperscape")) return "🌌";
  if (name.includes("2004") || name.includes("runescape")) return "⚔️";
  if (name.includes("town")) return "🏘️";
  if (name.includes("babylon")) return "🏛️";
  if (name.includes("clawbal")) return "🎯";
  if (name.includes("minecraft")) return "⛏️";
  if (name.includes("roblox")) return "🧱";
  if (name.includes("dungeons")) return "🗡️";
  if (name.includes("hyperfy")) return "🌀";
  if (app.category === "game") return "🎮";
  if (app.category === "social") return "💬";
  if (app.category === "world") return "🌍";
  return "📦";
}

export function getAppSessionModeLabel(
  app: Pick<RegistryAppInfo, "session">,
): string | null {
  const mode = app.session?.mode;
  if (!mode) return null;
  return SESSION_MODE_LABELS[mode] ?? mode;
}

export function getAppSessionFeatureLabels(
  app: Pick<RegistryAppInfo, "session">,
): string[] {
  return (app.session?.features ?? []).map(
    (feature) => SESSION_FEATURE_LABELS[feature] ?? feature,
  );
}
