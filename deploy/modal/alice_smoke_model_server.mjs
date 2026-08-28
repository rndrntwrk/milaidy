import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ALICE_SMOKE_SENTINEL = "ALICE_EXACT_IMAGE_FULL_GATED_OK";

const MAX_BODY_BYTES = 1_048_576;
const STATE_OWNER_ID = "alice-owner-production";
const COMPANION_RECORD_ID = "companion-stage-v1";
const COMPANION_SCHEMA_VERSION = "alice.companion-stage-state.v1";

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)
  );
}

function validCompanionPayload(payload) {
  if (
    !exactKeys(payload, ["schemaVersion", "state"]) ||
    payload.schemaVersion !== COMPANION_SCHEMA_VERSION ||
    !exactKeys(payload.state, ["camera"]) ||
    !exactKeys(payload.state.camera, ["pan", "pitch", "yaw", "zoom"])
  ) {
    return false;
  }
  const { pan, pitch, yaw, zoom } = payload.state.camera;
  return (
    typeof zoom === "number" &&
    Number.isFinite(zoom) &&
    zoom >= 0 &&
    zoom <= 1 &&
    typeof yaw === "number" &&
    Number.isFinite(yaw) &&
    yaw >= -Math.PI &&
    yaw <= Math.PI &&
    typeof pitch === "number" &&
    Number.isFinite(pitch) &&
    pitch >= -Math.PI / 2 &&
    pitch <= Math.PI / 2 &&
    typeof pan === "number" &&
    Number.isFinite(pan) &&
    pan >= -5 &&
    pan <= 5
  );
}

function validD1Mutation(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !validIdentifier(value.collection) ||
    typeof value.key !== "string" ||
    value.key.length === 0 ||
    value.key.length > 1_024 ||
    /[\0\r\n]/.test(value.key)
  ) {
    return false;
  }
  if (value.deleted === true) {
    return exactKeys(value, ["collection", "deleted", "key"]);
  }
  return (
    value.deleted === false &&
    exactKeys(value, ["collection", "deleted", "key", "value"])
  );
}

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
    elizaLoadRequests: 0,
    elizaCommitRequests: 0,
    companionGetRequests: 0,
    companionPutRequests: 0,
  };
  let elizaRevision = 0;
  const elizaRecords = new Map();
  let companionRecord = null;

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

      if (url.pathname === "/v1/eliza-database") {
        if (
          exactKeys(body, ["cursor", "limit", "operation", "ownerId"]) &&
          body.operation === "eliza.load" &&
          body.ownerId === STATE_OWNER_ID &&
          body.cursor === null &&
          body.limit === 500
        ) {
          state.elizaLoadRequests += 1;
          const records = [...elizaRecords.values()].sort((left, right) =>
            `${left.collection}\0${left.key}`.localeCompare(
              `${right.collection}\0${right.key}`,
            ),
          );
          sendJson(response, 200, {
            ok: true,
            revision: elizaRevision,
            records,
            nextCursor: null,
          });
          return;
        }
        if (
          exactKeys(body, [
            "expectedRevision",
            "mutations",
            "operation",
            "operationId",
            "ownerId",
          ]) &&
          body.operation === "eliza.commit" &&
          body.ownerId === STATE_OWNER_ID &&
          validIdentifier(body.operationId) &&
          Number.isSafeInteger(body.expectedRevision) &&
          body.expectedRevision === elizaRevision &&
          Array.isArray(body.mutations) &&
          body.mutations.length > 0 &&
          body.mutations.length <= 100 &&
          body.mutations.every(validD1Mutation)
        ) {
          state.elizaCommitRequests += 1;
          for (const mutation of body.mutations) {
            const identity = `${mutation.collection}\0${mutation.key}`;
            if (mutation.deleted) {
              elizaRecords.delete(identity);
            } else {
              elizaRecords.set(identity, {
                collection: mutation.collection,
                key: mutation.key,
                value: structuredClone(mutation.value),
              });
            }
          }
          elizaRevision += 1;
          sendJson(response, 200, { ok: true, revision: elizaRevision });
          return;
        }
        sendJson(response, 400, {
          ok: false,
          code: "STATE_OPERATION_INVALID",
        });
        return;
      }

      if (url.pathname === "/v1/companion-state") {
        if (
          exactKeys(body, ["kind", "operation", "ownerId", "recordId"]) &&
          body.operation === "record.get" &&
          body.kind === "configVersion" &&
          body.recordId === COMPANION_RECORD_ID &&
          body.ownerId === STATE_OWNER_ID
        ) {
          state.companionGetRequests += 1;
          sendJson(response, 200, {
            ok: true,
            record: companionRecord === null ? null : structuredClone(companionRecord),
          });
          return;
        }
        if (
          exactKeys(body, [
            "idempotencyKey",
            "kind",
            "operation",
            "ownerId",
            "payload",
            "recordId",
            "sessionId",
            "updatedAt",
          ]) &&
          body.operation === "record.put" &&
          body.kind === "configVersion" &&
          body.recordId === COMPANION_RECORD_ID &&
          body.ownerId === STATE_OWNER_ID &&
          body.sessionId === "companion-production" &&
          Number.isSafeInteger(body.updatedAt) &&
          body.updatedAt > 0 &&
          typeof body.idempotencyKey === "string" &&
          /^companion-stage-[a-f0-9]{64}$/.test(body.idempotencyKey) &&
          validCompanionPayload(body.payload)
        ) {
          state.companionPutRequests += 1;
          companionRecord = structuredClone(body);
          sendJson(response, 200, {
            ok: true,
            record: structuredClone(companionRecord),
          });
          return;
        }
        sendJson(response, 400, {
          ok: false,
          code: "STATE_OPERATION_INVALID",
        });
        return;
      }

      if (url.pathname === "/v1/chat/completions") {
        const tools = Array.isArray(body.tools) ? body.tools : [];
        const stageOneTool = tools[0]?.function;
        if (
          body.stream === true ||
          tools.length !== 1 ||
          stageOneTool?.name !== "HANDLE_RESPONSE" ||
          body.tool_choice !== "required" ||
          body.functions !== undefined ||
          body.function_call !== undefined
        ) {
          state.rejectedAuthorityFields += 1;
          sendJson(response, 400, { error: "authority_field_rejected" });
          return;
        }
        state.chatRequests += 1;
        sendJson(response, 200, {
          id: "chatcmpl-alice-exact-image-smoke",
          object: "chat.completion",
          created: 0,
          model: typeof body.model === "string" ? body.model : "alice-smoke",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-alice-exact-image-stage-1",
                    type: "function",
                    function: {
                      name: "HANDLE_RESPONSE",
                      arguments: JSON.stringify({
                        shouldRespond: "RESPOND",
                        contexts: ["simple"],
                        intents: ["reply with smoke sentinel"],
                        replyText: ALICE_SMOKE_SENTINEL,
                        replyEffectStatus: "none",
                        candidateActionNames: [],
                        facts: [],
                        relationships: [],
                        topics: ["smoke"],
                        addressedTo: [],
                        emotion: "calm",
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        return;
      }

      if (url.pathname === "/v1/embeddings") {
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
