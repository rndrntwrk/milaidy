import type { RegistryAppInfo } from "../../api";

export const DEFAULT_VIEWER_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

const CURATED_APP_NAMES = new Set([
  "@hyperscape/plugin-hyperscape",
  "@elizaos/app-2004scape",
  "@elizaos/app-babylon",
  "@elizaos/app-defense-of-the-agents",
]);
const PROD_ALLOWED_APPS = CURATED_APP_NAMES;

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

interface AppsCatalogFilterOptions {
  activeAppNames?: ReadonlySet<string>;
  isProd?: boolean;
  searchQuery?: string;
  showActiveOnly?: boolean;
}

export function isCuratedGameApp(
  app: Pick<RegistryAppInfo, "category" | "name">,
): boolean {
  return app.category !== "game" || CURATED_APP_NAMES.has(app.name);
}

export function shouldShowAppInAppsView(
  app: Pick<RegistryAppInfo, "category" | "name">,
  isProd: boolean = typeof import.meta.env.PROD === "boolean"
    ? import.meta.env.PROD
    : Boolean(import.meta.env.PROD),
): boolean {
  if (!isCuratedGameApp(app)) return false;
  if (!isProd) return true;
  return PROD_ALLOWED_APPS.has(app.name);
}

export function filterAppsForCatalog(
  apps: RegistryAppInfo[],
  {
    activeAppNames = new Set<string>(),
    isProd,
    searchQuery = "",
    showActiveOnly = false,
  }: AppsCatalogFilterOptions = {},
): RegistryAppInfo[] {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return apps.filter((app) => {
    if (!shouldShowAppInAppsView(app, isProd)) {
      return false;
    }
    if (
      normalizedSearch &&
      !app.name.toLowerCase().includes(normalizedSearch) &&
      !(app.displayName ?? "").toLowerCase().includes(normalizedSearch) &&
      !(app.description ?? "").toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    if (showActiveOnly && !activeAppNames.has(app.name)) {
      return false;
    }
    return true;
  });
}

export function getDefaultAppsCatalogSelection(
  apps: RegistryAppInfo[],
  isProd: boolean = typeof import.meta.env.PROD === "boolean"
    ? import.meta.env.PROD
    : Boolean(import.meta.env.PROD),
): string | null {
  return (
    filterAppsForCatalog(apps, {
      isProd,
    })[0]?.name ?? null
  );
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
  if (name.includes("babylon")) return "🏛️";
  if (name.includes("defense-of-the-agents")) return "🛡️";
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
