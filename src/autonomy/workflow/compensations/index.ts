/**
 * Builtin compensation registrations.
 * @module autonomy/workflow/compensations
 */

import type {
  CompensationFn,
  CompensationRegistryInterface,
} from "../types.js";
import {
  generateAudioCompensation,
  generateImageCompensation,
  generateVideoCompensation,
} from "./media.compensation.js";
import {
  createTaskCompensation,
  phettaNotifyCompensation,
  phettaSendEventCompensation,
} from "./integration.compensation.js";
import {
  BUILTIN_COMPENSATION_ELIGIBILITY,
  listBuiltinCompensationEligibility,
} from "./eligibility.js";

const BUILTIN_COMPENSATIONS: Record<string, CompensationFn> = {
  CREATE_TASK: createTaskCompensation,
  GENERATE_AUDIO: generateAudioCompensation,
  GENERATE_IMAGE: generateImageCompensation,
  GENERATE_VIDEO: generateVideoCompensation,
  PHETTA_NOTIFY: phettaNotifyCompensation,
  PHETTA_SEND_EVENT: phettaSendEventCompensation,
};

/**
 * Register all builtin compensation functions.
 */
export function registerBuiltinCompensations(
  registry: CompensationRegistryInterface,
): void {
  for (const [toolName, compensation] of Object.entries(BUILTIN_COMPENSATIONS)) {
    registry.register(toolName, compensation);
  }
}

export function listBuiltinCompensationTools(): string[] {
  return Object.keys(BUILTIN_COMPENSATIONS).sort((a, b) =>
    a.localeCompare(b),
  );
}

export {
  BUILTIN_COMPENSATION_ELIGIBILITY,
  listBuiltinCompensationEligibility,
};
