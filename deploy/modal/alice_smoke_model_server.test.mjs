import assert from "node:assert/strict";
import test from "node:test";

import {
  ALICE_SMOKE_SENTINEL,
  createAliceSmokeModelServer,
} from "./alice_smoke_model_server.mjs";

test("the exact-image model sentinel accepts response-only chat and rejects tools", async (t) => {
  const server = createAliceSmokeModelServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const safe = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "alice-smoke", messages: [{ role: "user", content: "hello" }] }),
  });
  assert.equal(safe.status, 200);
  assert.equal((await safe.json()).choices[0].message.content, ALICE_SMOKE_SENTINEL);

  const toolAttempt = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "alice-smoke", messages: [], tools: [] }),
  });
  assert.equal(toolAttempt.status, 400);

  const state = await (await fetch(`${base}/__smoke/state`)).json();
  assert.deepEqual(state, {
    chatRequests: 1,
    embeddingRequests: 0,
    rejectedAuthorityFields: 1,
  });
});
