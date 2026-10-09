import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { forwardAliceChatCoding } from "../src/alice-coding-chat";

const id = "10000000-0000-4000-8000-000000000001";
const secret = "test-native-coding-token-32-bytes-long";
const body = {
  schemaVersion: "alice.native-coding.v1",
  requestId: id,
  issuedAt: Date.now(),
  message: {
    id,
    entityId: id,
    roomId: id,
    source: "discord",
    accountId: "default",
    externalId: "111111111",
    externalMessageId: "222222222",
    channelId: "123456789",
  },
  request: {
    repository: "rndrntwrk/milaidy",
    baseCommit: "a".repeat(40),
    prompt: "Fix the bug",
    delivery: "pull-request",
  },
};
function start(value = body, validSignature = true) {
  const raw = JSON.stringify(value);
  return new Request("http://alice-coding.internal/v1/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alice-native-coding-signature": validSignature
        ? createHmac("sha256", secret)
            .update(`alice.native-coding.v1\n${raw}`)
            .digest("hex")
        : "a".repeat(64),
    },
    body: raw,
  });
}
test("authenticated native request reaches only draft PR admission, never merge or arbitrary authority routes", async () => {
  const calls: Request[] = [];
  const env = {
    ALICE_RUNTIME_API_TOKEN: secret,
    ALICE_AUTHORITY: {
      getByName(name: string) {
        expect(name).toBe("authority/global-safety-v1");
        return {
          async fetch(request: Request) {
            calls.push(request);
            return Response.json({ ok: true, status: "queued" });
          },
        };
      },
    },
  };
  expect((await forwardAliceChatCoding(start(), env)).status).toBe(200);
  expect(new URL(calls[0]!.url).pathname).toBe("/coding/chat/start");
  expect((await calls[0]!.json()).requestId).toBe(id);
  expect((await forwardAliceChatCoding(start(body, false), env)).status).toBe(
    403,
  );
  expect(
    (
      await forwardAliceChatCoding(
        start({ ...body, issuedAt: Date.now() - 600_000 }),
        env,
      )
    ).status,
  ).toBe(403);
  for (const path of [
    "/coding/chat/bind",
    "/authorize",
    `/v1/tasks/${id}/merge`,
  ]) {
    expect(
      (
        await forwardAliceChatCoding(
          new Request(`http://alice-coding.internal${path}`, {
            method: "POST",
          }),
          env,
        )
      ).status,
    ).toBe(404);
  }
  expect(calls).toHaveLength(1);
});
