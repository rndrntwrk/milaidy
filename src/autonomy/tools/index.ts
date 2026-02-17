/**
 * Tool contracts barrel export.
 *
 * @module autonomy/tools
 */

export { ToolRegistry } from "./registry.js";

export { classifyRisk } from "./risk-classification.js";
export {
  ANALYZE_IMAGE,
  BUILTIN_CONTRACTS,
  createCustomActionContract,
  GENERATE_AUDIO,
  GENERATE_IMAGE,
  GENERATE_VIDEO,
  INSTALL_PLUGIN,
  PLAY_EMOTE,
  RESTART_AGENT,
  RUN_IN_TERMINAL,
  registerBuiltinToolContracts,
} from "./schemas/index.js";
export {
  createRuntimeActionContract,
  registerRuntimeActionContracts,
} from "./runtime-contracts.js";
export type {
  ProposedToolCall,
  RiskClass,
  SchemaValidatorInterface,
  SideEffect,
  ToolCallSource,
  ToolContract,
  ToolRegistryInterface,
  ToolValidationError,
  ToolValidationErrorCode,
  ToolValidationResult,
} from "./types.js";
