import {
  CHARACTER_PRESETS,
  SHARED_STYLE_RULES,
  STYLE_PRESETS,
  getPresetNameMap,
  getStylePresets,
} from "@miladyai/agent/onboarding-presets";
import type { StylePreset } from "@miladyai/agent/contracts/onboarding";

/** @deprecated Use StylePreset from @miladyai/agent/contracts/onboarding */
export type MiladyStylePreset = StylePreset;

export {
  CHARACTER_PRESETS,
  SHARED_STYLE_RULES,
  STYLE_PRESETS,
  getPresetNameMap,
  getStylePresets,
};
