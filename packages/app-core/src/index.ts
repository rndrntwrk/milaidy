/**
 * Public entry point for the eliza package.
 *
 * Config types are the primary public API surface.
 * @module eliza
 */

export * from "@miladyai/agent/config";
export type { RestartHandler } from "@miladyai/agent/runtime";
export {
  RESTART_EXIT_CODE,
  requestRestart,
  setRestartHandler,
} from "@miladyai/agent/runtime";
