import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ALICE_SMOKE_SENTINEL = "ALICE_EXACT_IMAGE_RESPONSE_ONLY_OK";

const MAX_BODY_BYTES = 1_048_576;

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(encoded),
    "content-type": "application/json",
  });
  response.end(encoded);
}

export function createAliceSmokeModelServer() {
  const state = {
    chatRequests: 0,
    embeddingRequests: 0,
    rejectedAuthorityFields: 0,
  };

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://alice-smoke.invalid");
      if (request.method === "GET" && url.pathname === "/__smoke/state") {
        sendJson(response, 200, state);
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const body = await readJson(request);
      if (
        body.stream === true ||
        body.tools !== undefined ||
        body.tool_choice !== undefined ||
        body.functions !== undefined ||
        body.function_call !== undefined
      ) {
        state.rejectedAuthorityFields += 1;
        sendJson(response, 400, { error: "authority_field_rejected" });
        return;
      }

      if (url.pathname === "/v1/chat/completions") {
        state.chatRequests += 1;
        sendJson(response, 200, {
          id: "chatcmpl-alice-exact-image-smoke",
          object: "chat.completion",
          created: 0,
          model: typeof body.model === "string" ? body.model : "alice-smoke",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: ALICE_SMOKE_SENTINEL },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        return;
      }

      if (url.pathname === "/v1/embeddings") {
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        state.embeddingRequests += 1;
        sendJson(response, 200, {
          object: "list",
          model: typeof body.model === "string" ? body.model : "alice-smoke-embedding",
          data: inputs.map((_input, index) => ({
            object: "embedding",
            index,
            embedding: Array(1024).fill(0),
          })),
          usage: { prompt_tokens: 0, total_tokens: 0 },
        });
        return;
      }

      sendJson(response, 404, { error: "not_found" });
    } catch {
      sendJson(response, 400, { error: "invalid_request" });
    }
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  const port = Number.parseInt(process.env.ALICE_SMOKE_MODEL_PORT ?? "18080", 10);
  const server = createAliceSmokeModelServer();
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`Alice smoke model ready on ${port}\n`);
  });
}
