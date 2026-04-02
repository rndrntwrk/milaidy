import { getVrmPreviewUrl, getVrmUrl } from "../../state/vrm";
import {
  fetchWithTimeout,
  resolveCompatApiToken,
} from "../../utils/api-request";
import { resolveApiUrl } from "../../utils/asset-url";
import { PREMADE_VOICES } from "../../voice/types";
import { prefetchVrmToCache } from "../avatar/VrmEngine";
import type { CharacterRosterEntry } from "../character/CharacterRoster";
import { buildPreviewTtsRequestPlans } from "./identity-preview-tts";

const PREVIEW_TTS_FETCH_TIMEOUT_MS = 15_000;
const imagePreloadSet = new Set<string>();
const linkPreloadSet = new Set<string>();
const vrmPrefetchSet = new Set<string>();
const voicePreviewPromiseCache = new Map<string, Promise<Blob | null>>();

function appendPreloadLink(
  href: string,
  as: "image" | "fetch",
  type?: string,
): void {
  if (typeof document === "undefined") return;
  const key = `${as}:${href}`;
  if (linkPreloadSet.has(key)) return;
  linkPreloadSet.add(key);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = as;
  link.href = href;
  if (type) link.type = type;
  if (as === "fetch") link.crossOrigin = "anonymous";
  document.head?.appendChild(link);
}

function warmImage(url: string): void {
  if (typeof window === "undefined") return;
  if (imagePreloadSet.has(url)) return;
  imagePreloadSet.add(url);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
}

export function preloadRosterImages(entries: CharacterRosterEntry[]): void {
  for (const entry of entries) {
    const previewUrl = getVrmPreviewUrl(entry.avatarIndex);
    appendPreloadLink(previewUrl, "image", "image/png");
    warmImage(previewUrl);
  }
}

export function preloadRosterVrms(entries: CharacterRosterEntry[]): void {
  for (const entry of entries) {
    const vrmUrl = getVrmUrl(entry.avatarIndex);
    if (vrmPrefetchSet.has(vrmUrl)) continue;
    vrmPrefetchSet.add(vrmUrl);
    void prefetchVrmToCache(vrmUrl);
  }
}

export async function getOnboardingVoicePreviewBlob(
  entry: Pick<CharacterRosterEntry, "catchphrase" | "voicePresetId">,
): Promise<Blob | null> {
  const text = entry.catchphrase?.trim();
  if (!text || typeof window === "undefined") return null;

  const selectedPreset = entry.voicePresetId
    ? PREMADE_VOICES.find((voice) => voice.id === entry.voicePresetId)
    : undefined;
  const voiceId = selectedPreset?.voiceId?.trim() ?? "";
  const cacheKey = `${voiceId}::${text}`;
  const cached = voicePreviewPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const apiToken = resolveCompatApiToken();
    const requestPlans = buildPreviewTtsRequestPlans({
      text,
      voiceId: voiceId || undefined,
      // Prefer the cloud proxy first during onboarding so Eliza Cloud logins
      // can synthesize the selected preset voice without requiring a browser key.
      preferCloudProxy: true,
    });

    for (const plan of requestPlans) {
      try {
        const response = await fetchWithTimeout(
          resolveApiUrl(plan.endpoint),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
              ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
            },
            body: JSON.stringify(plan.body),
          },
          PREVIEW_TTS_FETCH_TIMEOUT_MS,
        );
        if (!response.ok) continue;
        const audioBlob = await response.blob();
        if (audioBlob.size > 0) {
          return audioBlob;
        }
      } catch {
        // Best-effort warm cache — try the next endpoint or return null.
      }
    }

    return null;
  })();

  voicePreviewPromiseCache.set(cacheKey, promise);
  return promise;
}

export function preloadOnboardingCharacterAssets(
  entries: CharacterRosterEntry[],
  options?: { voiceEntry?: CharacterRosterEntry | null },
): void {
  preloadRosterImages(entries);
  preloadRosterVrms(entries);
  if (options?.voiceEntry) {
    void getOnboardingVoicePreviewBlob(options.voiceEntry);
  }
}
