export * from "@elizaos/autonomous/config/config";

// Re-export with Eliza naming for the fork's own source code (TUI, awareness, etc.)
export {
  loadElizaConfig,
  saveElizaConfig,
} from "@elizaos/autonomous/config/config";

export type { ElizaConfig } from "@elizaos/autonomous/config/types";
