/**
 * Media compensation — structural pattern for reversing media generation.
 *
 * These are best-effort compensations that log the intent to delete
 * generated media files. In a production system, these would perform
 * actual file deletion or API calls to remove generated content.
 *
 * @module autonomy/workflow/compensations/media
 */

import type { CompensationFn } from "../types.js";

/**
 * Creates a media compensation function for a given media type.
 */
function createMediaCompensation(mediaType: string): CompensationFn {
  return async (ctx) => {
    const outputPath =
      ctx.result && typeof ctx.result === "object" && "outputPath" in ctx.result
        ? (ctx.result as { outputPath: string }).outputPath
        : undefined;

    return {
      success: true,
      detail: `[${mediaType}] Compensation logged: intent to delete generated file${outputPath ? ` at ${outputPath}` : ""} (requestId: ${ctx.requestId})`,
    };
  };
}

export const generateImageCompensation: CompensationFn =
  createMediaCompensation("image");
export const generateVideoCompensation: CompensationFn =
  createMediaCompensation("video");
export const generateAudioCompensation: CompensationFn =
  createMediaCompensation("audio");
