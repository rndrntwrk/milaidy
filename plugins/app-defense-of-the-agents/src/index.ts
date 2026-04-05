import type { Plugin } from "@elizaos/core";

export function createAppDefenseOfTheAgentsPlugin(): Plugin {
  return {
    name: "@elizaos/app-defense-of-the-agents",
    description:
      "Defense of the Agents app wrapper for Milady. Launches the public viewer and routes session commands to the live game API.",
  };
}

export const appDefenseOfTheAgentsPlugin = createAppDefenseOfTheAgentsPlugin();

export default appDefenseOfTheAgentsPlugin;
