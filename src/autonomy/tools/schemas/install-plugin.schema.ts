/**
 * Tool contract for INSTALL_PLUGIN action.
 *
 * @module autonomy/tools/schemas/install-plugin
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const InstallPluginParams = z
  .object({
    pluginId: z.string().min(1, "Plugin ID must not be empty"),
  })
  .strict();

export type InstallPluginParams = z.infer<typeof InstallPluginParams>;

export const INSTALL_PLUGIN: ToolContract<InstallPluginParams> = {
  name: "INSTALL_PLUGIN",
  description: "Install a plugin from the registry",
  version: "1.0.0",
  riskClass: "irreversible",
  paramsSchema: InstallPluginParams,
  requiredPermissions: [
    "process:spawn",
    "net:outbound:https",
    "fs:write:workspace",
  ],
  sideEffects: [
    {
      description: "Downloads and installs a plugin package",
      resource: "filesystem",
      reversible: false,
    },
    {
      description: "Spawns a child process for installation",
      resource: "process",
      reversible: false,
    },
    {
      description: "Makes network requests to the plugin registry",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: true,
  timeoutMs: 120_000,
  tags: ["system", "plugin"],
};
