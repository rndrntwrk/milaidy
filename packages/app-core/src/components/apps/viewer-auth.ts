import type {
  AppRunSummary,
  AppViewerAuthMessage,
} from "../../api/client-types-cloud";

function normalizeEmbedFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function resolvePostMessageTargetOrigin(viewerUrl: string): string {
  if (viewerUrl.startsWith("/")) return window.location.origin;
  const match = viewerUrl.match(/^https?:\/\/[^/?#]+/i);
  return match?.[0] ?? "*";
}

export function resolveViewerReadyEventType(
  payload: AppViewerAuthMessage | null | undefined,
): string | null {
  if (!payload?.type) {
    return null;
  }

  const normalizedType = payload.type.trim();
  if (normalizedType.length === 0) {
    return null;
  }
  return normalizedType.replace(/_AUTH$/i, "_READY");
}

export function buildViewerSessionKey(
  viewerUrl: string,
  payload: AppViewerAuthMessage | null | undefined,
): string {
  return `${viewerUrl}::${JSON.stringify(payload ?? null)}`;
}

export function shouldUseEmbeddedAppViewer(
  run: AppRunSummary | null | undefined,
): boolean {
  const viewer = run?.viewer;
  if (!viewer?.url) {
    return false;
  }

  if (viewer.postMessageAuth) {
    return true;
  }

  if (normalizeEmbedFlag(viewer.embedParams?.embedded)) {
    return true;
  }

  return typeof viewer.embedParams?.surface === "string";
}
