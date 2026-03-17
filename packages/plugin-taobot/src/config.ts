/**
 * TaoBot x RNDRNTWRK configuration.
 *
 * Environment variables follow the STREAM555_ and ARCADE555_ conventions
 * from the upstream plugins, with TAOBOT_ overrides for customization.
 */

export interface TaobotConfig {
  /** 555stream control plane URL */
  streamBaseUrl: string;
  /** 555 Arcade API URL */
  arcadeBaseUrl: string;
  /** Agent API key (shared across both plugins) */
  agentApiKey: string;
  /** Stable session ID for session reuse across restarts */
  sessionId?: string;
  /** Whether to require human approval for destructive actions */
  requireApprovals: boolean;
  /** Default stream input type */
  defaultStreamInput: "lofi" | "composition" | "camera" | "screen" | "browser";
  /** Default overlay template to apply on go-live */
  defaultOverlayTemplate?: string;
  /** Preferred arcade games for TaoBot sessions */
  preferredGames: string[];
  /** Philanthropy allocation percentage (0-100) from battle winnings */
  philanthropyPercent: number;
  /** TaoBot's visual theme name for the 555 platform */
  themeName: string;
}

export function loadConfig(): TaobotConfig {
  return {
    streamBaseUrl:
      process.env.TAOBOT_STREAM_URL ||
      process.env.STREAM555_PUBLIC_BASE_URL ||
      "https://stream.rndrntwrk.com",
    arcadeBaseUrl:
      process.env.TAOBOT_ARCADE_URL ||
      process.env.ARCADE555_BASE_URL ||
      "https://555.rndrntwrk.com",
    agentApiKey:
      process.env.TAOBOT_API_KEY ||
      process.env.STREAM555_AGENT_API_KEY ||
      process.env.ARCADE555_AGENT_API_KEY ||
      "",
    sessionId:
      process.env.TAOBOT_SESSION_ID ||
      process.env.STREAM555_AUTO_CONNECT_SESSION_ID,
    requireApprovals:
      (process.env.TAOBOT_REQUIRE_APPROVALS ??
        process.env.STREAM555_REQUIRE_APPROVALS ??
        "true") === "true",
    defaultStreamInput:
      (process.env.TAOBOT_DEFAULT_INPUT as TaobotConfig["defaultStreamInput"]) ||
      "composition",
    defaultOverlayTemplate: process.env.TAOBOT_OVERLAY_TEMPLATE,
    preferredGames: (process.env.TAOBOT_PREFERRED_GAMES || "godai-is-back,vedas-run,knighthood")
      .split(",")
      .map((g: string) => g.trim()),
    philanthropyPercent: parseInt(process.env.TAOBOT_PHILANTHROPY_PERCENT || "30", 10),
    themeName: process.env.TAOBOT_THEME || "taobot-psychedelic-futurism",
  };
}
