import type { Provider } from "@elizaos/core";
import {
  getBrowserWorkspaceUnavailableMessage,
  isBrowserWorkspaceBridgeConfigured,
  listBrowserWorkspaceTabs,
} from "@miladyai/agent/services/browser-workspace";

function formatTabList(): Promise<string> {
  return listBrowserWorkspaceTabs().then((tabs) => {
    if (tabs.length === 0) {
      return "Milady browser workspace: no tabs are open.";
    }

    const lines = [
      `Milady browser workspace: ${tabs.length} tab${tabs.length === 1 ? "" : "s"} open.`,
    ];
    for (const tab of tabs.slice(0, 8)) {
      lines.push(
        `- ${tab.id} [${tab.visible ? "visible" : "background"}] ${tab.url}`,
      );
    }
    return lines.join("\n");
  });
}

export const miladyBrowserWorkspaceProvider: Provider = {
  name: "milady_browser_workspace",
  description:
    "Summarizes browser tabs currently running inside the Milady desktop shell.",
  get: async () => {
    if (!isBrowserWorkspaceBridgeConfigured()) {
      return {
        text: getBrowserWorkspaceUnavailableMessage(),
        data: { available: false },
      };
    }

    try {
      const text = await formatTabList();
      return {
        text,
        data: {
          available: true,
          tabs: await listBrowserWorkspaceTabs(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        text: `Milady browser workspace error: ${message}`,
        data: { available: true, error: message },
      };
    }
  },
};
