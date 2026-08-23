import type { Plugin } from "@elizaos/core";

/**
 * Alice production deliberately replaces Milady's built-in Eliza bridge.
 * Model and SQL plugins are supplied separately; this plugin must remain an
 * inert identity marker with no actions, task workers, providers, services,
 * evaluators, init hook, or custom-action registry.
 */
export function createAliceProductionRuntimePlugin(): Plugin {
  return {
    name: "alice-production-response-only",
    description: "Inert proposer-only Alice production boundary",
    actions: [],
    evaluators: [],
    providers: [],
    services: [],
  };
}
