/**
 * Risk classification for tool contracts.
 *
 * Maps plugin permissions to risk classes using the existing
 * DANGEROUS_PERMISSIONS set from the permission system.
 *
 * @module autonomy/tools/risk-classification
 */

import {
  DANGEROUS_PERMISSIONS,
  type PluginPermission,
} from "../../plugins/permissions.js";
import type { RiskClass } from "./types.js";

/**
 * Permissions that indicate write/mutation capabilities but are not
 * classified as dangerous. These map to the "reversible" risk class.
 */
const WRITE_PERMISSIONS: Set<PluginPermission> = new Set([
  "fs:write:workspace",
  "fs:write:temp",
  "process:spawn",
  "process:env:read",
  "net:outbound:https",
  "net:outbound:http",
  "net:outbound:websocket",
  "net:inbound:listen",
  "net:dns",
  "ai:inference",
  "ai:embedding",
  "ai:training",
  "data:database",
  "data:memory",
]);

/**
 * Classify the risk level of a tool based on its required permissions.
 *
 * This provides a **default** classification based on permissions alone.
 * Built-in tool contracts may override this with a stricter riskClass
 * when the semantic risk is higher than what permissions imply (e.g.
 * RESTART_AGENT is irreversible despite only requiring process:spawn).
 *
 * - Any dangerous permission → "irreversible"
 * - Any write/mutation permission → "reversible"
 * - Otherwise → "read-only"
 */
export function classifyRisk(permissions: PluginPermission[]): RiskClass {
  let hasWrite = false;

  for (const perm of permissions) {
    if (DANGEROUS_PERMISSIONS.has(perm)) {
      return "irreversible";
    }
    if (WRITE_PERMISSIONS.has(perm)) {
      hasWrite = true;
    }
  }

  return hasWrite ? "reversible" : "read-only";
}
