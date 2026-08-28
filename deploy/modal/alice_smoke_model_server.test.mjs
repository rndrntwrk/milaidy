import assert from "node:assert/strict";
import test from "node:test";

import {
  ALICE_SMOKE_SENTINEL,
  createAliceSmokeModelServer,
} from "./alice_smoke_model_server.mjs";

test("the exact-image model sentinel accepts only the full-gated Stage 1 tool", async (t) => {
  const server = createAliceSmokeModelServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const safe = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "alice-smoke",
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "HANDLE_RESPONSE",
            description: "Stage 1",
            parameters: { type: "object" },
          },
        },
      ],
      tool_choice: "required",
    }),
  });
  assert.equal(safe.status, 200);
  const safeBody = await safe.json();
  assert.equal(safeBody.choices[0].message.content, null);
  assert.equal(safeBody.choices[0].message.tool_calls[0].function.name, "HANDLE_RESPONSE");
  assert.equal(
    JSON.parse(safeBody.choices[0].message.tool_calls[0].function.arguments)
      .replyText,
    ALICE_SMOKE_SENTINEL,
  );

  const toolAttempt = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "alice-smoke",
      messages: [],
      tools: [
        {
          type: "function",
          function: {
            name: "DEPLOY_APP",
            parameters: { type: "object" },
          },
        },
      ],
      tool_choice: "required",
    }),
  });
  assert.equal(toolAttempt.status, 400);

  const state = await (await fetch(`${base}/__smoke/state`)).json();
  assert.deepEqual(state, {
    chatRequests: 1,
    embeddingRequests: 0,
    rejectedAuthorityFields: 1,
    elizaLoadRequests: 0,
    elizaCommitRequests: 0,
    companionGetRequests: 0,
    companionPutRequests: 0,
  });
});

test("the exact-image smoke dependency server preserves D1 and Companion state", async (t) => {
  const server = createAliceSmokeModelServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const invoke = async (pathname, body) => {
    const response = await fetch(`${base}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const reject = async (pathname, body) => {
    const response = await fetch(`${base}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      code: "STATE_OPERATION_INVALID",
    });
  };

  assert.deepEqual(
    await invoke("/v1/eliza-database", {
      operation: "eliza.load",
      ownerId: "alice-owner-production",
      cursor: null,
      limit: 500,
    }),
    { ok: true, revision: 0, records: [], nextCursor: null },
  );
  assert.deepEqual(
    await invoke("/v1/eliza-database", {
      operation: "eliza.commit",
      ownerId: "alice-owner-production",
      operationId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      mutations: [
        {
          collection: "agents",
          key: "alice-agent",
          deleted: false,
          value: { name: "Alice" },
        },
      ],
    }),
    { ok: true, revision: 1 },
  );
  await reject("/v1/eliza-database", {
    operation: "eliza.commit",
    ownerId: "alice-owner-production",
    operationId: "00000000-0000-4000-8000-000000000002",
    expectedRevision: 0,
    mutations: [
      {
        collection: "agents",
        key: "alice-agent",
        deleted: true,
      },
    ],
  });
  assert.deepEqual(
    await invoke("/v1/eliza-database", {
      operation: "eliza.load",
      ownerId: "alice-owner-production",
      cursor: null,
      limit: 500,
    }),
    {
      ok: true,
      revision: 1,
      records: [
        {
          collection: "agents",
          key: "alice-agent",
          value: { name: "Alice" },
        },
      ],
      nextCursor: null,
    },
  );

  const companionRecord = {
    operation: "record.put",
    kind: "configVersion",
    recordId: "companion-stage-v1",
    ownerId: "alice-owner-production",
    sessionId: "companion-production",
    payload: {
      schemaVersion: "alice.companion-stage-state.v1",
      state: { camera: { zoom: 0.5, yaw: 0, pitch: 0, pan: 0 } },
    },
    updatedAt: 1,
    idempotencyKey: `companion-stage-${"a".repeat(64)}`,
  };
  assert.deepEqual(
    await invoke("/v1/companion-state", companionRecord),
    { ok: true, record: companionRecord },
  );
  assert.deepEqual(
    await invoke("/v1/companion-state", {
      operation: "record.get",
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId: "alice-owner-production",
    }),
    { ok: true, record: companionRecord },
  );
  await reject("/v1/companion-state", {
    operation: "record.get",
    kind: "approvalReceipt",
    recordId: "companion-stage-v1",
    ownerId: "alice-owner-production",
  });
  await reject("/v1/companion-state", {
    operation: "record.get",
    kind: "configVersion",
    recordId: "companion-stage-v1",
    ownerId: "other-owner",
  });

  const stateResponse = await fetch(`${base}/__smoke/state`);
  const stateText = await stateResponse.text();
  assert.doesNotMatch(stateText, /Alice|companion-stage-v1|alice-agent/);
  const state = JSON.parse(stateText);
  assert.deepEqual(state, {
    chatRequests: 0,
    embeddingRequests: 0,
    rejectedAuthorityFields: 0,
    elizaLoadRequests: 2,
    elizaCommitRequests: 1,
    companionGetRequests: 1,
    companionPutRequests: 1,
  });
});
