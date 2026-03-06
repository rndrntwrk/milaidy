/**
 * Domain capability packs barrel exports.
 *
 * @module autonomy/domains
 */

// Coding domain
export * from "./coding/index.js";
// Governance
export * from "./governance/index.js";
// Pilot
export * from "./pilot/index.js";
// Domain pack framework
export {
  DomainPackRegistry,
  type DomainPackRegistryInterface,
} from "./registry.js";
export type {
  DomainBenchmark,
  DomainId,
  DomainPack,
  DomainPackInfo,
  DomainPackStatus,
  DomainSafeModeTrigger,
  DomainTriggerContext,
  DomainTriggerSeverity,
} from "./types.js";
