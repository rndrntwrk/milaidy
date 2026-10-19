import {
  isAliceNativeStreamRuntime,
  setNativeAgentTokenPersistence,
} from "@rndrntwrk/plugin-555stream/auth";
import { runSerializedConfigMutation } from "../api/config-mutation.js";
import { saveElizaConfig } from "./config.js";
import type { ElizaConfig } from "./types.js";

export function registerAliceNativeStreamTokenPersistence(
  getConfig: () => ElizaConfig,
  fallbackOnly = false,
): void {
  if (!isAliceNativeStreamRuntime()) return;
  setNativeAgentTokenPersistence(async (nextToken, previousToken) => {
    const config = getConfig();
    await runSerializedConfigMutation(config, async () => {
      const currentToken = config.env?.vars?.STREAM555_AGENT_TOKEN ?? config.env?.STREAM555_AGENT_TOKEN;
      if (!isAliceNativeStreamRuntime() || getConfig() !== config ||
          typeof currentToken !== "string" || currentToken.trim() !== previousToken) {
        throw new Error("Stream credential changed before persistence");
      }
      const candidate = structuredClone(config);
      const env = candidate.env ??= {};
      const vars = env.vars ??= {};
      vars.STREAM555_AGENT_TOKEN = nextToken;
      delete env.STREAM555_AGENT_TOKEN;
      for (const key of ["STREAM555_AGENT_API_KEY", "STREAM_API_BEARER_TOKEN"]) {
        delete env[key];
        delete vars[key];
      }
      await saveElizaConfig(candidate);
      config.env = env;
    });
  }, fallbackOnly);
}
