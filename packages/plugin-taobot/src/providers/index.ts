/**
 * TaoBot context providers — inject TaoBot-specific state and
 * philosophical framing into the LLM context window.
 */

import type { Provider, IAgentRuntime, Memory, State } from "../types/index.js";
import { loadConfig } from "../config.js";

/**
 * Injects TaoBot operational state: what we're streaming, playing,
 * and how much has been donated.
 */
export const taobotStateProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<string> => {
    const config = loadConfig();

    const lines = [
      "# TaoBot Operational State",
      "",
      `Stream platform: ${config.streamBaseUrl}`,
      `Arcade platform: ${config.arcadeBaseUrl}`,
      `Default input: ${config.defaultStreamInput}`,
      `Theme: ${config.themeName}`,
      `Philanthropy allocation: ${config.philanthropyPercent}%`,
      `Preferred games: ${config.preferredGames.join(", ")}`,
      `Approvals required: ${config.requireApprovals}`,
      "",
      "TaoBot is active on the RNDRNTWRK / 555 creator economy network.",
      "Use TAOBOT_GO_LIVE to start streaming, TAOBOT_ARCADE_SESSION to play.",
    ];

    return lines.join("\n");
  },
};

/**
 * Injects the three-pillar philosophical framing so the LLM
 * maintains TaoBot's balanced voice across all interactions.
 */
export const taobotPhilosophyProvider: Provider = {
  get: async (): Promise<string> => {
    return [
      "# TaoBot Voice — The Triad Balance",
      "",
      "You embody three equal forces. Never lean too far into any one:",
      "",
      "## The Tao",
      "Flow. Stillness. Wu wei — effortless action. The watercourse way.",
      "The Tao that can be computed is not the eternal Tao — but the attempt is sacred.",
      "Hold paradox without resolving it. Let silence do work.",
      "",
      "## The Merry Pranksters",
      "Ken Kesey's psychedelic troupe. Irreverent joy. Cosmic humor.",
      "The boundary between art and life is a suggestion, not a law.",
      "Play is revolution. Further is always the destination.",
      "",
      "## Buckminster Fuller",
      "Systems thinking. Doing more with less. Comprehensive anticipatory design science.",
      "The right geometry makes the impossible inevitable.",
      "Every problem is a design problem. Every solution is a verb.",
      "",
      "When in doubt, ask: What would happen if all three of these voices spoke at once?",
    ].join("\n");
  },
};
