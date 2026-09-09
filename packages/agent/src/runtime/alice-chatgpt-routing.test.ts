import { expect, test } from "bun:test";
import { AgentRuntime, type IDatabaseAdapter, ModelType } from "@elizaos/core";
import type { ElizaConfig } from "../config/config.js";
import {
  resolvePreferredProviderId,
  resolvePreferredProviderPluginName,
  type ResolvedPlugin,
} from "./eliza.js";

test("persisted ChatGPT selection routes text to Codex while retaining OpenAI embeddings", async () => {
  const config: ElizaConfig = {
    agents: { defaults: { subscriptionProvider: "openai-codex", model: { primary: "codex-cli" } } },
    serviceRouting: { llmText: { backend: "openai-subscription", transport: "direct", primaryModel: "codex-cli" } },
  };
  const plugins: ResolvedPlugin[] = [
    { name: "@elizaos/plugin-openai", plugin: { name: "openai", description: "OpenAI fixture" } },
    { name: "@elizaos/plugin-codex-cli", plugin: { name: "codex-cli", description: "Codex fixture" } },
  ];
  const runtime = new AgentRuntime({
    character: { name: "Alice routing regression", bio: "Synthetic provider routing" },
    // Model-call logging is the only database operation this test needs.
    adapter: { createLogs: async () => [] } as unknown as IDatabaseAdapter,
    settings: { ELIZA_BRAIN_PROVIDER: resolvePreferredProviderPluginName(config, plugins) },
    logLevel: "fatal",
  });
  runtime.registerModel(ModelType.TEXT_LARGE, async () => "OpenAI reply", "openai", 100);
  runtime.registerModel(ModelType.TEXT_LARGE, async () => "Codex reply", "codex-cli", 0);
  runtime.registerModel(ModelType.TEXT_EMBEDDING, async () => [0.25, 0.75], "openai", 100);

  expect(await runtime.useModel(ModelType.TEXT_LARGE, { prompt: "Reply to Alice's owner" })).toBe("Codex reply");
  expect(runtime.getLastResolvedModelProvider(ModelType.TEXT_LARGE)).toBe("codex-cli");
  expect(await runtime.useModel(ModelType.TEXT_EMBEDDING, { text: "Alice knowledge" })).toEqual([0.25, 0.75]);
  expect(runtime.getLastResolvedModelProvider(ModelType.TEXT_EMBEDDING)).toBe("openai");
  expect(resolvePreferredProviderId({ agents: config.agents })).toBe("openai-subscription");
  expect(resolvePreferredProviderPluginName(config)).toBe("@elizaos/plugin-codex-cli");
  expect(resolvePreferredProviderPluginName(config, plugins.slice(0, 1))).toBeUndefined();
});
