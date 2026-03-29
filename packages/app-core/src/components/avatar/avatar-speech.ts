import type { AvatarSpeechCapabilities } from "@miladyai/shared/contracts";
import {
  DEFAULT_ALICE_SPEECH_MOTION_PATH,
  resolveDefaultSpeechCapabilitiesForAvatarIndex,
} from "@miladyai/shared/onboarding-presets";

export function resolveSpeechMotionPathForAvatarIndex(
  avatarIndex: number,
): string | null {
  return (
    resolveDefaultSpeechCapabilitiesForAvatarIndex(avatarIndex).speechMotionPath ??
    null
  );
}

export function resolveSpeechMotionPathForCapabilities(
  capabilities: AvatarSpeechCapabilities | null | undefined,
): string | null {
  const path = capabilities?.speechMotionPath?.trim();
  return path ? path : null;
}

export function createFallbackSpeechCapabilities(
  overrides?: Partial<AvatarSpeechCapabilities>,
): AvatarSpeechCapabilities {
  return {
    speechMotionPath: null,
    supportedVisemes: ["aa"],
    supportedExpressions: [],
    advancedFaceDriver: false,
    ...overrides,
  };
}

export { DEFAULT_ALICE_SPEECH_MOTION_PATH as ALICE_SPEECH_MOTION_PATH };
