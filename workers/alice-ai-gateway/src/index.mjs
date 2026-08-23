import {
  ALICE_AI_CHAT_MODELS,
  ALICE_AI_EMBEDDING_MODELS,
  ALICE_AI_GATEWAY_OPTIONS,
  buildAliceAiGatewayEffectiveConfig,
  verifyAliceEffectiveConfigBinding,
} from "../../alice-effective-config.js";

const MAX_BODY_BYTES = 1_048_576;
const CHAT_MODELS = new Map(Object.entries(ALICE_AI_CHAT_MODELS));
const EMBEDDING_MODELS = new Set(ALICE_AI_EMBEDDING_MODELS);
const CHAT_ALLOWED_FIELDS = new Set([
  "model",
  "messages",
  "stream",
  "max_tokens",
  "temperature",
  "top_p",
  "frequency_penalty",
  "presence_penalty",
  "stop",
  "seed",
  "response_format",
]);
const textEncoder = new TextEncoder();
const AI_GATEWAY_OPTIONS = ALICE_AI_GATEWAY_OPTIONS;

async function verifyEffectiveConfig(env) {
  await verifyAliceEffectiveConfigBinding({
    encodedManifest: env.ALICE_DEPLOYMENT_MANIFEST_B64,
    expectedManifestSha256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    role: "aiGateway",
    effectiveConfig: buildAliceAiGatewayEffectiveConfig(),
  });
}

function openAiError(status, code, message, type = "invalid_request_error") {
  return Response.json(
    {
      error: {
        message,
        type,
        code,
      },
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

function timingSafeEqualText(actual, expected) {
  const actualBytes = textEncoder.encode(actual);
  const expectedBytes = textEncoder.encode(expected);
  const width = Math.max(actualBytes.length, expectedBytes.length);
  let mismatch = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < width; index += 1) {
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function validDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

async function sha256Digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

async function getActiveReleaseBinding(env) {
  if (
    !env.ALICE_CONTROL ||
    typeof env.ALICE_CONTROL.fetch !== "function" ||
    typeof env.ALICE_AI_CONTROL_SERVICE_TOKEN !== "string" ||
    env.ALICE_AI_CONTROL_SERVICE_TOKEN.length < 32
  ) {
    throw new Error("control binding is not configured");
  }
  const response = await env.ALICE_CONTROL.fetch(
    "https://alice-control.internal/control/internal/v1/model/binding",
    {
      method: "GET",
      headers: { "x-alice-service-token": env.ALICE_AI_CONTROL_SERVICE_TOKEN },
    }
  );
  const body = await response.json();
  if (
    !response.ok ||
    !body?.ok ||
    !validReleaseBinding(body.binding) ||
    body.deploymentManifestSha256 !== env.ALICE_DEPLOYMENT_MANIFEST_SHA256
  ) {
    throw new Error("control health is unavailable");
  }
  return body.binding;
}

async function authenticateRelease(request, env) {
  if (!validDigest(env.ALICE_RUNTIME_RELEASE_TOKEN_SHA256)) return null;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (token.length < 24 || token.includes("\n") || token.includes("\r")) return null;

  const binding = await getActiveReleaseBinding(env);
  const presentedDigest = await sha256Digest(`${binding.releaseDigest}:${token}`);
  return timingSafeEqualText(presentedDigest, env.ALICE_RUNTIME_RELEASE_TOKEN_SHA256)
    ? binding
    : null;
}

function validReleaseBinding(value) {
  return (
    value &&
    typeof value === "object" &&
    validDigest(value.programDigest) &&
    validDigest(value.releaseDigest) &&
    validDigest(value.policyHash)
  );
}

function estimateChatBudget(body) {
  const promptBytes = textEncoder.encode(JSON.stringify(body)).byteLength;
  const requestedCompletion = Number.isInteger(body.max_tokens) ? body.max_tokens : 1024;
  if (requestedCompletion <= 0 || requestedCompletion > 4096) return null;
  // UTF-8 bytes are a conservative upper bound on input token count. Charge
  // the full enforced completion ceiling up front so usage cannot exceed the
  // Durable Object reservation even when the provider omits usage metadata.
  return {
    estimatedUnits: Math.max(1, promptBytes + requestedCompletion),
    maxTokens: requestedCompletion,
  };
}

function estimateEmbeddingUnits(input) {
  const inputBytes = input.reduce((total, value) => total + textEncoder.encode(value).byteLength, 0);
  // Charge the full UTF-8 byte ceiling rather than an average token estimate.
  // This stays conservative for punctuation, CJK, and adversarial short-token
  // inputs without relying on a provider tokenizer.
  return Math.max(1, inputBytes + input.length);
}

function validateChatFields(body) {
  if (Object.keys(body).some((field) => !CHAT_ALLOWED_FIELDS.has(field))) {
    return openAiError(
      400,
      "field_not_allowed",
      "The request contains a field outside Alice's response-only schema."
    );
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return openAiError(400, "field_not_allowed", "stream must be a boolean.");
  }
  for (const field of ["temperature", "top_p", "frequency_penalty", "presence_penalty"]) {
    if (body[field] !== undefined && !Number.isFinite(body[field])) {
      return openAiError(400, "field_not_allowed", `${field} must be finite.`);
    }
  }
  return null;
}

async function reserveModelBudget(model, estimatedUnits, releaseBinding, env) {
  if (
    !env.ALICE_CONTROL ||
    typeof env.ALICE_CONTROL.fetch !== "function" ||
    typeof env.ALICE_AI_CONTROL_SERVICE_TOKEN !== "string" ||
    env.ALICE_AI_CONTROL_SERVICE_TOKEN.length < 32
  ) {
    throw new Error("control binding is not configured");
  }
  const headers = {
    "content-type": "application/json",
    "x-alice-service-token": env.ALICE_AI_CONTROL_SERVICE_TOKEN,
  };
  // A caller-controlled idempotency key would let repeated inference reuse one
  // budget reservation. Charge every accepted gateway request independently.
  const requestId = `request-${crypto.randomUUID()}`;
  const reservation = await env.ALICE_CONTROL.fetch(
    "https://alice-control.internal/control/internal/v1/model/reserve",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId,
        model,
        estimatedUnits,
        ...releaseBinding,
      }),
    }
  );
  const reservationBody = await reservation.json();
  if (!reservation.ok || !reservationBody?.decision) {
    throw new Error("control reservation is unavailable");
  }
  return reservationBody.decision;
}

function controlDeniedResponse(decision) {
  const status = decision.code === "MODEL_BUDGET_EXCEEDED" ? 429 : 503;
  return openAiError(
    status,
    "model_control_denied",
    "Alice model control denied the request.",
    "api_error"
  );
}

function controlUnavailableResponse() {
  return openAiError(
    503,
    "control_plane_unavailable",
    "Alice model control is unavailable.",
    "api_error"
  );
}

async function readBoundedJson(request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return {
      response: openAiError(415, "unsupported_media_type", "Content-Type must be application/json."),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return {
      response: openAiError(413, "request_too_large", "Request body exceeds 1 MiB."),
    };
  }

  if (!request.body) {
    return { response: openAiError(400, "invalid_json", "Request body is required.") };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel("request body exceeds limit");
        return {
          response: openAiError(413, "request_too_large", "Request body exceeds 1 MiB."),
        };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { response: openAiError(400, "invalid_json", "Request body must be a JSON object.") };
    }
    return { value };
  } catch {
    return { response: openAiError(400, "invalid_json", "Request body is not valid JSON.") };
  }
}

function filterOpenAiChatStream(stream) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let sawDone = false;

  function emitEvent(event, controller) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (sawDone) {
      throw new Error("Workers AI streamed data after the completion marker");
    }
    if (data === "[DONE]") {
      sawDone = true;
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new Error("Workers AI returned invalid streaming JSON");
    }

    if (payload?.object === "chat.completion.chunk" && Array.isArray(payload.choices)) {
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      return;
    }

    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.response === "string" &&
      payload.usage &&
      typeof payload.usage === "object"
    ) {
      return;
    }

    throw new Error("Workers AI returned an unsupported streaming event");
  }

  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        while (true) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (!boundary) break;
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          emitEvent(event, controller);
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          emitEvent(buffer, controller);
        }
        if (!sawDone) {
          throw new Error("Workers AI stream ended without a completion marker");
        }
      },
    })
  );
}

async function handleChat(request, body, releaseBinding, env) {
  const workerModel = typeof body.model === "string" ? CHAT_MODELS.get(body.model) : undefined;
  if (!workerModel) {
    return openAiError(400, "model_not_allowed", "The requested chat model is not allowed.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return openAiError(400, "invalid_messages", "messages must be a non-empty array.");
  }
  const fieldError = validateChatFields(body);
  if (fieldError) return fieldError;
  const budget = estimateChatBudget(body);
  if (budget === null) {
    return openAiError(400, "invalid_max_tokens", "max_tokens must be between 1 and 4096.");
  }

  try {
    const decision = await reserveModelBudget(
      body.model,
      budget.estimatedUnits,
      releaseBinding,
      env
    );
    if (!decision.allowed) return controlDeniedResponse(decision);
  } catch (error) {
    console.error(JSON.stringify({ event: "alice_ai_gateway_control_unavailable" }));
    return controlUnavailableResponse();
  }

  try {
    const input = {};
    for (const field of CHAT_ALLOWED_FIELDS) {
      if (field !== "model" && body[field] !== undefined) input[field] = body[field];
    }
    input.max_tokens = budget.maxTokens;
    const result = await env.AI.run(workerModel, input, AI_GATEWAY_OPTIONS);
    if (body.stream === true) {
      if (!(result instanceof ReadableStream)) {
        throw new Error("Workers AI returned an invalid streaming response");
      }
      return new Response(filterOpenAiChatStream(result), {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/event-stream",
        },
      });
    }
    return Response.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "alice_ai_gateway_upstream_error",
        route: "chat/completions",
      })
    );
    return openAiError(502, "upstream_error", "Workers AI chat request failed.", "api_error");
  }
}

function normalizeEmbeddingInput(input) {
  const values = typeof input === "string" ? [input] : input;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > 256 ||
    values.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    return null;
  }
  return values;
}

async function handleEmbeddings(request, body, releaseBinding, env) {
  if (typeof body.model !== "string" || !EMBEDDING_MODELS.has(body.model)) {
    return openAiError(400, "model_not_allowed", "The requested embedding model is not allowed.");
  }

  const input = normalizeEmbeddingInput(body.input);
  if (!input) {
    return openAiError(400, "invalid_input", "input must be a string or a non-empty string array.");
  }

  try {
    const decision = await reserveModelBudget(
      body.model,
      estimateEmbeddingUnits(input),
      releaseBinding,
      env
    );
    if (!decision.allowed) return controlDeniedResponse(decision);
  } catch (error) {
    console.error(JSON.stringify({ event: "alice_ai_gateway_control_unavailable" }));
    return controlUnavailableResponse();
  }

  try {
    const result = await env.AI.run(
      body.model,
      { text: input, truncate_inputs: false },
      AI_GATEWAY_OPTIONS
    );
    const embeddings = result?.data;
    if (
      !Array.isArray(embeddings) ||
      embeddings.length !== input.length ||
      embeddings.some(
        (embedding) =>
          !Array.isArray(embedding) || embedding.some((value) => !Number.isFinite(value))
      )
    ) {
      throw new Error("Workers AI returned an invalid embedding result");
    }

    return Response.json(
      {
        object: "list",
        model: body.model,
        data: embeddings.map((embedding, index) => ({
          object: "embedding",
          index,
          embedding,
        })),
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "alice_ai_gateway_upstream_error",
        route: "embeddings",
      })
    );
    return openAiError(502, "upstream_error", "Workers AI embedding request failed.", "api_error");
  }
}

export async function fetch(request, env) {
  const url = new URL(request.url);

  try {
    await verifyEffectiveConfig(env);
  } catch {
    return openAiError(
      503,
      "effective_config_mismatch",
      "Alice AI Gateway configuration is not admitted.",
      "api_error"
    );
  }

  if (url.pathname === "/healthz") {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    return Response.json({
      ok: true,
      service: "alice-ai-gateway",
      inference: "workers-ai-binding",
      aiGateway: "alice-production",
      controlPlane: "alice-production-control",
      deploymentManifestSha256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
      models: {
        chat: [...CHAT_MODELS.keys()],
        embeddings: [...EMBEDDING_MODELS],
      },
    });
  }

  if (url.pathname !== "/v1/chat/completions" && url.pathname !== "/v1/embeddings") {
    return openAiError(404, "not_found", "Route not found.");
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  let releaseBinding;
  try {
    releaseBinding = await authenticateRelease(request, env);
  } catch {
    return controlUnavailableResponse();
  }
  if (!releaseBinding) {
    return openAiError(401, "invalid_api_key", "Invalid API key.", "authentication_error");
  }

  const parsed = await readBoundedJson(request);
  if (parsed.response) return parsed.response;

  return url.pathname === "/v1/chat/completions"
    ? handleChat(request, parsed.value, releaseBinding, env)
    : handleEmbeddings(request, parsed.value, releaseBinding, env);
}

export default { fetch };
