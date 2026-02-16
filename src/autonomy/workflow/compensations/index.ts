/**
 * Builtin compensation registrations.
 * @module autonomy/workflow/compensations
 */

import type { CompensationRegistryInterface } from "../types.js";
import {
  generateAudioCompensation,
  generateImageCompensation,
  generateVideoCompensation,
} from "./media.compensation.js";

/**
 * Register all builtin compensation functions.
 */
export function registerBuiltinCompensations(
  registry: CompensationRegistryInterface,
): void {
  registry.register("GENERATE_IMAGE", generateImageCompensation);
  registry.register("GENERATE_VIDEO", generateVideoCompensation);
  registry.register("GENERATE_AUDIO", generateAudioCompensation);
}
