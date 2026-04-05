import { type IAgentRuntime, Service } from "@elizaos/core";

export class MiladyBrowserWorkspaceService extends Service {
  static serviceType = "milady_browser_workspace";

  capabilityDescription =
    "Controls hidden/showable browser tabs in the Milady desktop shell over a loopback bridge.";

  static override async start(
    runtime: IAgentRuntime,
  ): Promise<MiladyBrowserWorkspaceService> {
    return new MiladyBrowserWorkspaceService(runtime);
  }
}
