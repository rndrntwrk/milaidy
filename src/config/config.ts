export * from "@elizaos/autonomous/config/config";

// Re-export with Milady naming for the fork's own source code (TUI, awareness, etc.)
export {
  loadElizaConfig as loadMiladyConfig,
  saveElizaConfig as saveMiladyConfig,
} from "@elizaos/autonomous/config/config";

export type { ElizaConfig as MiladyConfig } from "@elizaos/autonomous/config/types";
