/**
 * Domain capability packs barrel exports.
 *
 * @module autonomy/domains
 */

// Domain pack framework
export { DomainPackRegistry, type DomainPackRegistryInterface } from "./registry.js";
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

// Governance
export * from "./governance/index.js";

// Coding domain
export * from "./coding/index.js";

// Pilot
export * from "./pilot/index.js";
