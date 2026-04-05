import { type IAgentRuntime, logger, Service } from "@elizaos/core";
import {
  cancelSelfControlExpiryTimer,
  reconcileSelfControlBlockState,
} from "./selfcontrol";

export class SelfControlBlockerService extends Service {
  static serviceType = "selfcontrol_blocker";

  capabilityDescription =
    "Maintains the local hosts-file website blocker and clears timed blocks when they expire.";

  static override async start(
    _runtime: IAgentRuntime,
  ): Promise<SelfControlBlockerService> {
    try {
      await reconcileSelfControlBlockState();
    } catch (error) {
      logger.warn(
        `[selfcontrol] Failed to reconcile hosts-file blocker state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return new SelfControlBlockerService(_runtime);
  }

  override async stop(): Promise<void> {
    cancelSelfControlExpiryTimer();
  }
}

export class WebsiteBlockerService extends SelfControlBlockerService {
  static override serviceType = "website_blocker";

  override capabilityDescription =
    "Maintains the local hosts-file website blocker and clears timed blocks when they expire.";

  static override async start(
    runtime: IAgentRuntime,
  ): Promise<WebsiteBlockerService> {
    try {
      await reconcileSelfControlBlockState();
    } catch (error) {
      logger.warn(
        `[selfcontrol] Failed to reconcile hosts-file blocker state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return new WebsiteBlockerService(runtime);
  }
}
