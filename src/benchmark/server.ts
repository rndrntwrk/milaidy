import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  elizaLogger,
  ModelType,
  stringToUuid,
} from "@elizaos/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3939; // Fixed port for benchmark

// Proper robust server implementation
export async function startBenchmarkServer() {
  elizaLogger.info("[bench] Initializing milaidy benchmark runtime...");

  // Plugins
  const plugins = [];

  // 1. SQL Plugin (Core) - Registers adapter automatically?
  try {
    const sqlPlugin = await import("@elizaos/plugin-sql").then(
      (m) => m.sqlPlugin || m.default,
    );
    plugins.push(sqlPlugin);
    elizaLogger.info("[bench] Loaded core plugin: @elizaos/plugin-sql");
  } catch (e) {
    elizaLogger.error("Failed to load sql plugin", e);
  }

  // 2. Computer Use Plugin (Local)
  if (process.env.MILAIDY_ENABLE_COMPUTERUSE) {
    try {
      // Import directly from source to ensure we use Native backend (not MCP)
      // const computerUsePlugin = await import("@elizaos/plugin-computeruse").then(m => m.computerUsePlugin || m.default);
      const { computerUsePlugin } = await import(
        "../../../eliza/packages/plugin-computeruse/src/index.ts"
      );
      plugins.push(computerUsePlugin);
      elizaLogger.info(
        "[bench] Loaded local plugin: @elizaos/plugin-computeruse",
      );
    } catch (e) {
      elizaLogger.error("Failed to load computer use plugin", e);
    }
  }

  // 3. OpenAI Plugin (for Groq)
  try {
    const openaiPlugin = await import("@elizaos/plugin-openai").then(
      (m) => m.openaiPlugin || m.default,
    );
    plugins.push(openaiPlugin);
    elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-openai");
  } catch (e) {
    elizaLogger.error("Failed to load openai plugin", e);
  }

  // 4. Mock Plugin
  if (process.env.MILAIDY_BENCH_MOCK === "true") {
    try {
      // Updated import path if needed, assuming relative to this file
      const { mockPlugin } = await import("./mock-plugin.ts");
      plugins.push(mockPlugin);
      elizaLogger.info("[bench] Loaded mock plugin");
    } catch (e) {
      elizaLogger.error("[bench] Failed to load mock plugin", e);
    }
  }

  // Runtime Configuration
  const runtime = new AgentRuntime({
    token: "mock-token",
    modelProvider: "openai",
    character: {
      name: "Kira",
      modelProvider: "openai",
      imageModelProvider: "openai",
      bio: ["A computer user agent."],
      lore: [],
      messageExamples: [],
      style: { all: [], chat: [], post: [] },
      topics: [],
      adjectives: [],
      plugins: [],
    },
    plugins: plugins,
  });

  await runtime.initialize();
  elizaLogger.info(
    `[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`,
  );

  // HTTP Server for Benchmark Adapter
  const server = http.createServer(async (req, res) => {
    // CORs
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/api/benchmark/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ready" }));
      return;
    }

    if (req.url === "/api/benchmark/reset" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { text, image } = JSON.parse(body);
          elizaLogger.info(`[bench] Received prompt: ${text}`);

          // Use Mock Plugin Text Generation directly if available?
          // Or follow standard flow.

          // Standard flow:
          // 1. Embed text (for memory search)
          // 2. Generate response (LLM)

          // If mock plugin simulates LLM, runtime.generateText is fine.
          // But if mocks rely on "text_generation" vs "TEXT_GENERATION"...

          // We will invoke `mockPlugin` logic if needed.
          // But preferably use standard `runtime.generateText`.

          const state = await runtime.composeState(
            {
              content: { text: text },
              senderId: stringToUuid("user"),
              agentId: runtime.agentId,
              roomId: stringToUuid("bench-room"),
              userId: stringToUuid("user"),
            },
            {
              agentName: "Kira",
              senderName: "User",
            },
          );

          // Add image to state context if present
          if (image) {
            state.image = image;
          }

          // Force generation
          // We use `generateText` with basic context
          // For Computer Use, we expect actions.
          // Mock plugin returns <BENCHMARK_ACTION>...

          // Define Prompt Context
          const promptContext = `Task: ${text}
          
          You are an AI agent that can control a computer.
          Available actions: CLICK, TYPE, SCROLL, etc.
          
          Current State:
          ${JSON.stringify(state)}
          
          Generate the next action to take.
          `;

          // Generate text
          try {
            const { text: generatedText } = await runtime.generateText(
              promptContext,
              {
                modelType: ModelType.TEXT_SMALL,
                stopSequences: [],
              },
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                text: generatedText,
                actions: [], // Parse if needed here, but adapter does it
              }),
            );
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            elizaLogger.error("[bench] Text generation error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: errorMessage }));
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          elizaLogger.error("[bench] Request error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    // Fallback 404
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    elizaLogger.info(
      `[bench] Milaidy benchmark server listening on port ${PORT}`,
    );
    console.log(`MILAIDY_BENCH_READY port=${PORT}`); // Signal for python adapter
  });
}

// Invoke start
startBenchmarkServer().catch((err) => {
  elizaLogger.error("Failed to start benchmark server", err);
  process.exit(1);
});
