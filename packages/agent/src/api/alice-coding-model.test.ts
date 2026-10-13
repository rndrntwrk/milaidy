import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { handleAliceCodingModel } from "./alice-coding-model";

type Input = Parameters<typeof handleAliceCodingModel>[2];
async function request(input: Input) {
  const server = createServer((req, res) => { void handleAliceCodingModel(req, res, input); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/internal/v1/coding/model`, { method: "POST" });
    return { status: response.status, text: await response.text(), type: response.headers.get("content-type") };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const body = {
  model: "codex-cli",
  messages: [
    { role: "system", content: "Fix the requested code" },
    { role: "user", content: "Read the file" },
    { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: '{"path":"file.ts"}' } }] },
    { role: "tool", content: "original source", tool_call_id: "call-1" },
  ],
  tools: [{ type: "function", function: { name: "edit", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
  tool_choice: "auto",
};

test("preserves the coding transcript, tools and result through the saved Codex backend", async () => {
  const result = await request({ authenticated: true, body, model: "gpt-6-sol", generate: async (params) => {
    expect(params.model).toBe("gpt-6-sol");
    expect(params.messages).toEqual([
      { role: "system", content: "Fix the requested code" },
      { role: "user", content: "Read the file" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "read", arguments: '{"path":"file.ts"}', type: "function" }] },
      { role: "tool", content: "original source", toolCallId: "call-1" },
    ]);
    expect(params.tools).toEqual(body.tools.map((tool) => tool.function));
    expect(params.toolChoice).toBe("auto");
    expect(params.abortSignal?.aborted).toBe(false);
    return { text: "", toolCalls: [{ id: "call-2", name: "edit", arguments: { path: "file.ts" } }],
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 } };
  } });
  expect(result.status).toBe(200);
  expect(JSON.parse(result.text)).toMatchObject({ model: "gpt-6-sol", choices: [{ finish_reason: "tool_calls",
    message: { tool_calls: [{ id: "call-2", function: { name: "edit", arguments: '{"path":"file.ts"}' } }] } }],
    usage: { total_tokens: 25 } });
});

test("streams OpenAI-compatible text and tool chunks for OpenCode", async () => {
  const result = await request({ authenticated: true, body: { ...body, stream: true }, model: "gpt-6-sol",
    generate: async (params) => {
      params.onTextDelta?.("Working");
      return { text: "Working", toolCalls: [{ id: "call-2", name: "edit", arguments: {} }] };
    } });
  expect(result.type).toBe("text/event-stream");
  const chunks = result.text.split("\n\n").filter((part) => part.startsWith("data: {")).map((part) => JSON.parse(part.slice(6)));
  expect(chunks[1].choices[0].delta.content).toBe("Working");
  expect(chunks[2].choices[0].delta.tool_calls[0]).toMatchObject({ index: 0, id: "call-2", type: "function" });
  expect(chunks[3].choices[0].finish_reason).toBe("tool_calls");
  expect(result.text.endsWith("data: [DONE]\n\n")).toBe(true);
});

test("denies untrusted callers and provider overrides before generating", async () => {
  let calls = 0;
  const generate: Input["generate"] = async () => { calls++; throw new Error("Should not run"); };
  expect((await request({ authenticated: false, body, model: "gpt-6-sol", generate })).status).toBe(403);
  expect((await request({ authenticated: true, body: { ...body, model: "workers-ai/other" }, model: "gpt-6-sol", generate })).status).toBe(400);
  expect(calls).toBe(0);
});

test("fails without a fallback and never returns provider credential details", async () => {
  const result = await request({ authenticated: true, body, model: "gpt-6-sol", generate: async () => {
    throw new Error("provider rejected secret-access-token");
  } });
  expect(result.status).toBe(502);
  expect(result.text).toContain("CODING_SUBSCRIPTION_INFERENCE_FAILED");
  expect(result.text).not.toContain("secret-access-token");
});
