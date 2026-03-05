import type { Plugin } from "@elizaos/core";
import { createLegacyArcadeWrapperPlugin } from "../five55-arcade-compat.js";

export function createFive55ScoreCapturePlugin(): Plugin {
  return createLegacyArcadeWrapperPlugin({
    pluginName: "five55-score-capture",
    description:
      "Deprecated compatibility wrapper for canonical 555 Arcade score capture actions.",
    providerName: "five55ScoreCapture",
    providerTitle: "555 Arcade Score Capture Legacy Surface",
    envKeys: ["ARCADE555_SCORE_CAPTURE_API_URL", "FIVE55_SCORE_CAPTURE_API_URL"],
    actionNames: ["FIVE55_SCORE_CAPTURE_READ", "FIVE55_SCORE_CAPTURE_SUBMIT"],
  });
}

export default createFive55ScoreCapturePlugin;
