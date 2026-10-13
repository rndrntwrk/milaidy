import type http from "node:http";
import type { CodexBackend } from "@elizaos/plugin-codex-cli";
import { z } from "zod";

type Generate = CodexBackend["generate"];
const name = z.string().min(1).max(128);
const toolCall = z.object({
  id: name,
  type: z.literal("function"),
  function: z.object({ name, arguments: z.string() }),
});
const message = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.object({ type: z.literal("text"), text: z.string() }))]).nullish(),
  tool_calls: z.array(toolCall).max(64).optional(),
  tool_call_id: name.optional(),
}).superRefine((value, ctx) => {
  if (value.role === "tool" && !value.tool_call_id ||
    value.tool_calls && value.role !== "assistant") {
    ctx.addIssue({ code: "custom", message: "Invalid tool message" });
  }
});
const codingRequest = z.object({
  model: z.literal("codex-cli"),
  messages: z.array(message).min(1).max(256),
  tools: z.array(z.object({
    type: z.literal("function"),
    function: z.object({
      name,
      description: z.string().optional(),
      parameters: z.record(z.string(), z.json()),
      strict: z.boolean().optional(),
    }),
  })).max(64).optional(),
  tool_choice: z.union([
    z.enum(["auto", "none", "required"]),
    z.object({ type: z.literal("function"), function: z.object({ name }) }),
  ]).optional(),
  stream: z.boolean().optional(),
});

let backend: CodexBackend | undefined;
async function generateWithSavedCodex(params: Parameters<Generate>[0]) {
  if (!backend) {
    const { CodexBackend } = await import("@elizaos/plugin-codex-cli");
    backend = new CodexBackend();
  }
  return backend.generate(params);
}

/** Inference only: tool definitions/results belong to the leased sandbox, never the runtime. */
export async function handleAliceCodingModel(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  input: {
    authenticated: boolean;
    body: unknown;
    model: string | undefined;
    generate?: Generate;
  },
): Promise<void> {
  const reply = (status: number, code: string) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code, message: code } }));
  };
  if (!input.authenticated) return reply(403, "CODING_MODEL_BROKER_REQUIRED");
  const parsed = codingRequest.safeParse(input.body);
  if (!parsed.success) return reply(400, "CODING_MODEL_REQUEST_INVALID");
  if (!input.model) return reply(503, "CODING_SUBSCRIPTION_MODEL_UNCONFIGURED");
  const body = parsed.data;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 120_000);
  req.once("aborted", abort);
  res.once("close", abort);
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const base = { id, created, model: input.model };
  const emit = (delta: object, finishReason: string | null = null, usage?: object) => {
    res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason: finishReason }], ...(usage ? { usage } : {}) })}\n\n`);
  };
  try {
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      emit({ role: "assistant", content: "" });
    }
    const result = await (input.generate ?? generateWithSavedCodex)({
      prompt: "",
      model: input.model,
      reasoningEffort: "max",
      messages: body.messages.map((entry) => ({
        role: entry.role,
        content: entry.content,
        ...(entry.tool_call_id ? { toolCallId: entry.tool_call_id } : {}),
        ...(entry.tool_calls ? { toolCalls: entry.tool_calls.map((call) => ({
          id: call.id, name: call.function.name, arguments: call.function.arguments, type: call.type,
        })) } : {}),
      })),
      ...(body.tools ? { tools: body.tools.map((tool) => tool.function) } : {}),
      ...(body.tool_choice ? { toolChoice: body.tool_choice } : {}),
      abortSignal: controller.signal,
      ...(body.stream ? { onTextDelta: (text: string) => emit({ content: text }) } : {}),
    });
    if (controller.signal.aborted) throw new Error("CODING_MODEL_ABORTED");
    const calls = result.toolCalls.map((call) => ({
      id: call.id, type: "function",
      function: { name: call.name, arguments: typeof call.arguments === "string"
        ? call.arguments : JSON.stringify(call.arguments) },
    }));
    const finish = calls.length ? "tool_calls" : "stop";
    const usage = result.usage ? { prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens } : undefined;
    if (body.stream) {
      if (calls.length) emit({ tool_calls: calls.map((call, index) => ({ index, ...call })) });
      emit({}, finish, usage);
      res.end("data: [DONE]\n\n");
    } else {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0,
        message: { role: "assistant", content: result.text, ...(calls.length ? { tool_calls: calls } : {}) },
        finish_reason: finish }], ...(usage ? { usage } : {}) }));
    }
  } catch {
    if (!res.destroyed) {
      if (res.headersSent) {
        res.end(`data: ${JSON.stringify({ error: { code: "CODING_SUBSCRIPTION_INFERENCE_FAILED",
          message: "Coding inference failed using the saved ChatGPT subscription" } })}\n\ndata: [DONE]\n\n`);
      } else reply(502, "CODING_SUBSCRIPTION_INFERENCE_FAILED");
    }
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abort);
    res.off("close", abort);
  }
}
