export type LiveLayoutMode = "camera-full" | "camera-hold";

export type LiveSecondarySourceKind = "game" | "screen" | "guest" | "web";

export type LiveSecondarySource = {
  id: string;
  kind: LiveSecondarySourceKind;
  label: string;
  activatedAt: number;
  viewerUrl?: string;
};

export type LiveSceneId = "default" | "active-pip";

export function resolveLiveLayoutMode(
  sources: readonly LiveSecondarySource[],
): LiveLayoutMode {
  return sources.length > 0 ? "camera-hold" : "camera-full";
}

export function resolveLiveSceneId(
  mode: LiveLayoutMode,
): LiveSceneId {
  return mode === "camera-hold" ? "active-pip" : "default";
}

export function resolveLiveHeroSource(
  sources: readonly LiveSecondarySource[],
): LiveSecondarySource | null {
  if (sources.length === 0) return null;
  return [...sources].sort((a, b) => b.activatedAt - a.activatedAt)[0] ?? null;
}

export function upsertLiveSecondarySource(
  sources: readonly LiveSecondarySource[],
  nextSource: LiveSecondarySource,
): LiveSecondarySource[] {
  const filtered = sources.filter((source) => source.id !== nextSource.id);
  return [...filtered, nextSource].sort((a, b) => a.activatedAt - b.activatedAt);
}

export function removeLiveSecondarySource(
  sources: readonly LiveSecondarySource[],
  sourceId: string,
): LiveSecondarySource[] {
  return sources.filter((source) => source.id !== sourceId);
}

export function liveSourceKindLabel(
  kind: LiveSecondarySourceKind,
): string {
  switch (kind) {
    case "game":
      return "Game";
    case "screen":
      return "Screen";
    case "guest":
      return "Guest";
    case "web":
      return "Web";
    default:
      return "Source";
  }
}
