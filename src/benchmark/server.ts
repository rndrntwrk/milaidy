
import {
  AgentRuntime,
  ModelProviderName,
  settings,
  stringToUuid,
  ServiceType,
  elizaLogger
} from "@elizaos/core";
import { SqliteDatabaseAdapter } from "@elizaos/plugin-sql";
import path from "path";
import fs from "fs";
import http from "http";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3939; // Fixed port for benchmark

// Proper robust server implementation
export async function startBenchmarkServer() {
  elizaLogger.info("[bench] Initializing milaidy benchmark runtime...");

  // Database Setup
  const db = new Database(":memory:");
  const dbAdapter = new SqliteDatabaseAdapter(db);

  // Plugins
  const plugins = [];

  // Core Plugins
  try {
    const sqlPlugin = await import("@elizaos/plugin-sql").then(m => m.sqlPlugin || m.default);
    plugins.push(sqlPlugin);
    elizaLogger.info("[bench] Loaded core plugin: @elizaos/plugin-sql");
  } catch (e) { elizaLogger.error("Failed to load sql plugin", e); }

  // Computer Use Plugin
  if (process.env.MILAIDY_ENABLE_COMPUTERUSE) {
    try {
      const computerPlugin = await import("@elizaos/plugin-computeruse").then(m => m.computerUsePlugin || m.default);
      plugins.push(computerPlugin);
      elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-computeruse");
    } catch (e) { elizaLogger.error("Failed to load computeruse plugin", e); }
  }

  // Mock Plugin (Critical for no-key testing)
  if (process.env.MILAIDY_BENCH_MOCK) {
    try {
      // Updated import path if needed, assuming relative to this file
      const { mockPlugin } = await import("./mock-plugin.ts");
      plugins.push(mockPlugin);
      elizaLogger.info("[bench] Loaded mock plugin");
    } catch (e) { elizaLogger.error("[bench] Failed to load mock plugin", e); }
  }

  // Runtime Configuration
  const runtime = new AgentRuntime({
    databaseAdapter: dbAdapter,
    token: "mock-token",
    modelProvider: ModelProviderName.OPENAI,
    character: {
      name: "Kira",
      username: "kira",
      modelProvider: ModelProviderName.OPENAI,
      bio: "Benchmark agent",
      lore: [],
      messageExamples: [],
      style: { all: [], chat: [], post: [] },
      topics: [],
      adjectives: [],
      plugins: []
    },
    plugins: plugins,
  });

  await runtime.initialize();
  elizaLogger.info(`[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`);

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

    if (req.url === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", async () => {
        try {
          const { text, image, context } = JSON.parse(body);
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
              userId: stringToUuid("user")
            },
            {
              agentName: "Kira",
              senderName: "User"
            }
          );

          // Add image to state context if present
          if (image) {
            state.image = image;
          }

          // Force generation
          // We use `generateText` with basic context
          // For Computer Use, we expect actions.
          // Mock plugin returns <BENCHMARK_ACTION>...

          const response = await runtime.generateText({
            context: context || text,
            modelClass: "small", // or whatever mock responds to
          });

          // If response is empty, maybe try another model class?

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            text: response,
            actions: [] // Parse if needed here, but adapter does it
          }));

        } catch (err: any) {
          elizaLogger.error("[bench] Request error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    elizaLogger.info(`[bench] Milaidy benchmark server listening on port ${PORT}`);
    console.log(`MILAIDY_BENCH_READY port=${PORT}`); // Signal for python adapter
  });
}

// Invoke start
startBenchmarkServer().catch(err => {
  elizaLogger.error("Failed to start benchmark server", err);
  process.exit(1);
});
