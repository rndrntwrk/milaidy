import {
  type AgentRuntime,
  logger,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";
import { seedBundledKnowledge } from "../../runtime/default-knowledge.js";
import { runtimeKnowledgeEnabled } from "../../runtime/native-runtime-features.js";
import { aliceCorpusGraphActions } from "./actions.js";
import { resolveAliceCorpusConfig } from "./config.js";
import { initializeAliceCorpusRuntime } from "./runtime.js";

function corpusDocumentId(agentId: string, key: string): string {
  return stringToUuid(
    `milady-default-knowledge:${agentId}:${key}:document`,
  );
}

export function createAliceCorpusPlugin(): Plugin {
  return {
    name: "alice-corpus",
    description:
      "Physically projected Alice corpus knowledge and read-only evidence graph integration.",
    init: async (_pluginConfig, runtime) => {
      const config = resolveAliceCorpusConfig(process.env);
      if (!config) return;
      if (!runtimeKnowledgeEnabled(runtime as AgentRuntime)) {
        throw new Error(
          "Alice corpus requires the native Eliza knowledge feature to be enabled",
        );
      }

      await initializeAliceCorpusRuntime(runtime, process.env, {
        seed: async (targetRuntime, documents) => {
          await seedBundledKnowledge(
            targetRuntime as AgentRuntime,
            documents as Parameters<typeof seedBundledKnowledge>[1],
          );
        },
        documentIdForKey: corpusDocumentId,
        log: (event, payload) => {
          logger.info(`[alice-corpus] ${event} ${JSON.stringify(payload)}`);
        },
      });
    },
    actions: aliceCorpusGraphActions,
  };
}

export const aliceCorpusPlugin = createAliceCorpusPlugin();
export const plugin = aliceCorpusPlugin;
export default aliceCorpusPlugin;
