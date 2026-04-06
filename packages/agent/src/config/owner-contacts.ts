import { logger } from "@elizaos/core";
import { loadElizaConfig } from "./config.js";
import type { OwnerContactsConfig } from "./types.agent-defaults.js";

type OwnerContactsLoadContext = {
  boundary: string;
  operation: string;
  message: string;
};

export function loadOwnerContactsConfig(
  context: OwnerContactsLoadContext,
): OwnerContactsConfig {
  try {
    return loadElizaConfig().agents?.defaults?.ownerContacts ?? {};
  } catch (error) {
    logger.warn(
      {
        boundary: context.boundary,
        operation: context.operation,
        err: error instanceof Error ? error : undefined,
      },
      context.message,
    );
    return {};
  }
}
