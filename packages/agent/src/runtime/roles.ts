import type { Plugin } from "@elizaos/core";

// Internal compatibility barrel for roles helpers used by published Milady packages.
// The old in-repo roles plugin source moved into @elizaos/core/roles, but the
// runtime still pre-registers a lightweight internal capability during bootstrap.
const rolesPlugin: Plugin = {
  name: "internal-roles",
  description: "Internal compatibility barrel for roles helpers",
};

export default rolesPlugin;
export * from "@elizaos/core/roles";
