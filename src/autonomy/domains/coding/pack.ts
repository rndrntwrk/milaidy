/**
 * Coding domain pack assembly — combines tool contracts, invariants,
 * benchmarks, and safe-mode triggers into a complete DomainPack.
 *
 * @module autonomy/domains/coding/pack
 */

import type { DomainPack } from "../types.js";
import { CODING_BENCHMARKS } from "./benchmarks.js";
import { CODING_INVARIANTS } from "./invariants.js";
import { CODING_SAFE_MODE_TRIGGERS } from "./safe-mode-triggers.js";
import { CODING_TOOL_CONTRACTS } from "./tool-contracts.js";
import type { CodingDomainConfig } from "./types.js";

/** Default coding domain pack instance. */
export const CODING_DOMAIN_PACK: DomainPack = {
  id: "coding",
  name: "Software Engineering",
  version: "1.0.0",
  description:
    "Domain capability pack for coding and software engineering tasks",
  toolContracts: [...CODING_TOOL_CONTRACTS],
  invariants: CODING_INVARIANTS,
  benchmarks: CODING_BENCHMARKS,
  tags: ["coding"],
  safeModeTriggers: CODING_SAFE_MODE_TRIGGERS,
  governancePolicyId: "coding-governance",
};

/**
 * Create a coding domain pack with optional configuration overrides.
 *
 * When `requireApprovalForWrites` is true, the WRITE_FILE contract
 * is cloned with `requiresApproval: true`.
 *
 * When `maxShellTimeoutMs` is provided, the SHELL_EXEC contract
 * is cloned with the updated timeout.
 */
export function createCodingDomainPack(
  config?: CodingDomainConfig,
): DomainPack {
  if (!config) return { ...CODING_DOMAIN_PACK };

  const toolContracts = CODING_TOOL_CONTRACTS.map((contract) => {
    if (contract.name === "WRITE_FILE" && config.requireApprovalForWrites) {
      return { ...contract, requiresApproval: true };
    }
    if (contract.name === "SHELL_EXEC" && config.maxShellTimeoutMs) {
      return { ...contract, timeoutMs: config.maxShellTimeoutMs };
    }
    return contract;
  });

  return {
    ...CODING_DOMAIN_PACK,
    toolContracts,
  };
}
