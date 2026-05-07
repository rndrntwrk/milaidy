import type {
  AvatarSpeechCapabilities,
  AvatarSpeechManifest,
} from "@miladyai/shared/contracts";
import { resolveDefaultSpeechCapabilitiesForAvatarIndex } from "@miladyai/shared/onboarding-presets";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../api";
import { getBootConfig } from "../config/boot-config";
import { createFallbackSpeechCapabilities } from "../components/avatar/avatar-speech";
import { getDefaultBundledVrmIndex, normalizeAvatarIndex } from "../state/vrm";

const CUSTOM_AVATAR_KEY = "custom";

let cachedCustomManifest: AvatarSpeechManifest | null | undefined;

function getBundledSpeechCapabilities(
  selectedVrmIndex: number,
): AvatarSpeechCapabilities {
  const normalized = normalizeAvatarIndex(
    selectedVrmIndex || getDefaultBundledVrmIndex(),
  );
  const asset = getBootConfig().vrmAssets?.[Math.max(0, normalized - 1)];
  return (
    asset?.speechCapabilities ??
    resolveDefaultSpeechCapabilitiesForAvatarIndex(normalized)
  );
}

export function buildCustomAvatarSpeechManifest(
  capabilities?: AvatarSpeechCapabilities | null,
): AvatarSpeechManifest {
  return {
    avatarKey: CUSTOM_AVATAR_KEY,
    version: 1,
    capabilities: capabilities ?? createFallbackSpeechCapabilities(),
  };
}

export function rememberCustomAvatarSpeechManifest(
  manifest: AvatarSpeechManifest | null | undefined,
): void {
  cachedCustomManifest = manifest ?? null;
}

export function useAvatarSpeechCapabilities(args: {
  selectedVrmIndex: number;
  customVrmUrl?: string | null;
}): {
  avatarKey: string;
  capabilities: AvatarSpeechCapabilities;
  manifest: AvatarSpeechManifest | null;
  loading: boolean;
  saveDetectedCapabilities: (
    capabilities: AvatarSpeechCapabilities,
  ) => Promise<void>;
} {
  const { selectedVrmIndex, customVrmUrl } = args;
  const [customManifest, setCustomManifest] = useState<AvatarSpeechManifest | null>(
    cachedCustomManifest ?? null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedVrmIndex !== 0 || !customVrmUrl) {
      setLoading(false);
      return;
    }
    if (cachedCustomManifest !== undefined) {
      setCustomManifest(cachedCustomManifest ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void client
      .getCustomAvatarManifest()
      .then((manifest) => {
        if (cancelled) return;
        cachedCustomManifest = manifest;
        setCustomManifest(manifest);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = buildCustomAvatarSpeechManifest();
        cachedCustomManifest = fallback;
        setCustomManifest(fallback);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customVrmUrl, selectedVrmIndex]);

  const saveDetectedCapabilities = useCallback(
    async (capabilities: AvatarSpeechCapabilities) => {
      if (selectedVrmIndex !== 0 || !customVrmUrl) {
        return;
      }
      const nextManifest = buildCustomAvatarSpeechManifest(capabilities);
      const currentManifest = cachedCustomManifest ?? customManifest;
      if (
        currentManifest &&
        JSON.stringify(currentManifest.capabilities) ===
          JSON.stringify(nextManifest.capabilities)
      ) {
        return;
      }
      cachedCustomManifest = nextManifest;
      setCustomManifest(nextManifest);
      try {
        const response = await client.saveCustomAvatarManifest(nextManifest);
        cachedCustomManifest = response.manifest;
        setCustomManifest(response.manifest);
      } catch {
        // Keep the detected manifest in memory even if persistence fails.
      }
    },
    [customManifest, customVrmUrl, selectedVrmIndex],
  );

  return useMemo(() => {
    if (selectedVrmIndex === 0) {
      const manifest = customManifest ?? buildCustomAvatarSpeechManifest();
      return {
        avatarKey: CUSTOM_AVATAR_KEY,
        capabilities: manifest.capabilities,
        manifest,
        loading,
        saveDetectedCapabilities,
      };
    }
    return {
      avatarKey: `bundled:${normalizeAvatarIndex(selectedVrmIndex || getDefaultBundledVrmIndex())}`,
      capabilities: getBundledSpeechCapabilities(selectedVrmIndex),
      manifest: null,
      loading: false,
      saveDetectedCapabilities: async () => {},
    };
  }, [customManifest, loading, saveDetectedCapabilities, selectedVrmIndex]);
}
