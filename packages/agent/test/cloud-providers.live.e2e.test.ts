import { beforeEach, describe, expect, it } from "vitest";
import { loadElizaConfig } from "../src/config/config";

const liveConfig = loadElizaConfig();
const LIVE_PROVIDER_KEY_SNAPSHOT = {
  openAiApiKey: process.env.OPENAI_API_KEY,
  elizaCloudApiKey:
    process.env.ELIZAOS_CLOUD_API_KEY ?? liveConfig.cloud?.apiKey,
};

const hasLiveOpenAiKey = Boolean(
  LIVE_PROVIDER_KEY_SNAPSHOT.openAiApiKey?.trim(),
);
const hasLiveElizaCloudKey = Boolean(
  LIVE_PROVIDER_KEY_SNAPSHOT.elizaCloudApiKey?.trim(),
);

function resolveLiveOpenAiModelId(): string {
  const configured =
    process.env.OPENAI_SMALL_MODEL?.trim() ||
    process.env.SMALL_MODEL?.trim() ||
    liveConfig.models?.small?.trim() ||
    "openai/gpt-5.4-mini";
  return configured.startsWith("openai/")
    ? configured.slice("openai/".length)
    : configured;
}

function expectCredential(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required for live cloud-provider E2E`);
  }
  return value;
}

if (hasLiveOpenAiKey || hasLiveElizaCloudKey) {
  describe("Live model calls", () => {
    beforeEach(() => {
      if (LIVE_PROVIDER_KEY_SNAPSHOT.openAiApiKey) {
        process.env.OPENAI_API_KEY = LIVE_PROVIDER_KEY_SNAPSHOT.openAiApiKey;
      }
      if (LIVE_PROVIDER_KEY_SNAPSHOT.elizaCloudApiKey) {
        process.env.ELIZAOS_CLOUD_API_KEY =
          LIVE_PROVIDER_KEY_SNAPSHOT.elizaCloudApiKey;
      }
    });

    if (hasLiveOpenAiKey) {
      it("OpenAI: generates text or returns a recognized model-access state", async () => {
        const key = expectCredential(
          "OPENAI_API_KEY",
          process.env.OPENAI_API_KEY,
        );

        const { generateText } = await import("ai");
        const { createOpenAI } = await import("@ai-sdk/openai");
        const openai = createOpenAI({
          apiKey: key,
          compatibility: "compatible",
        });
        try {
          const result = await generateText({
            model: openai.chat(resolveLiveOpenAiModelId()),
            prompt: "Reply with exactly: HELLO_TEST",
            maxTokens: 20,
          });
          expect(result.text).toContain("HELLO_TEST");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const expectedOpenAiFailure =
            /does not exist|do not have access|model_not_found|insufficient_quota|rate limit|authentication/i;
          if (expectedOpenAiFailure.test(message)) {
            expect(message).toMatch(expectedOpenAiFailure);
            return;
          }
          throw error;
        }
      }, 30_000);
    }

    if (hasLiveElizaCloudKey) {
      it("Eliza Cloud: generates text or returns a recognized auth/quota state", async () => {
        const cloudKey = expectCredential(
          "ELIZAOS_CLOUD_API_KEY",
          process.env.ELIZAOS_CLOUD_API_KEY ?? liveConfig.cloud?.apiKey,
        );
        process.env.ELIZAOS_CLOUD_API_KEY = cloudKey;

        const { generateText } = await import("ai");
        const { createOpenAI } = await import("@ai-sdk/openai");
        const openai = createOpenAI({
          apiKey: cloudKey,
          baseURL: "https://elizacloud.ai/api/v1",
          compatibility: "compatible",
        });
        try {
          const result = await generateText({
            model: openai.chat("openai/gpt-5.4-mini"),
            prompt: "Reply with exactly: CLOUD_TEST_OK",
            maxTokens: 20,
          });
          expect(result.text).toContain("CLOUD_TEST_OK");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const expectedCloudFailure =
            /authentication required|insufficient credits|quota|max usage reached/i;
          if (expectedCloudFailure.test(message)) {
            expect(message).toMatch(expectedCloudFailure);
            return;
          }
          throw error;
        }
      }, 30_000);
    }
  });
}
