import type { Plugin } from "@elizaos/core";
import { manageMiladyBrowserWorkspaceAction } from "./action";
import { miladyBrowserWorkspaceProvider } from "./provider";
import { MiladyBrowserWorkspaceService } from "./service";

export const miladyBrowserPlugin: Plugin = {
  name: "@miladyai/plugin-milady-browser",
  description:
    "Controls background browser tabs running inside the Milady desktop shell over a local bridge.",
  actions: [manageMiladyBrowserWorkspaceAction],
  providers: [miladyBrowserWorkspaceProvider],
  services: [MiladyBrowserWorkspaceService],
};

export {
  manageMiladyBrowserWorkspaceAction,
  miladyBrowserWorkspaceProvider,
  MiladyBrowserWorkspaceService,
};

export default miladyBrowserPlugin;
