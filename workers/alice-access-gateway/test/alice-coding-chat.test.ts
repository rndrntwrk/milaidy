import { expect, spyOn, test } from "bun:test";
import { createHmac, generateKeyPairSync } from "node:crypto";
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

test("repository lookup works with Workers redirect modes and rejects redirected HEAD responses", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    ALICE_GITHUB_APP_ID: "1234",
    ALICE_GITHUB_APP_PRIVATE_KEY_B64: Buffer.from(
      privateKey.export({ type: "pkcs8", format: "pem" }),
    ).toString("base64"),
  };
  let redirected = false;
  const headRequests: Request[] = [];
  const upstream = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    // Match workerd: redirect:error throws before any upstream request.
    if (init?.redirect === "error") throw new TypeError("Invalid redirect value");
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== "https://api.github.com") throw new Error("Unexpected upstream");
    if (url.pathname === "/repos/rndrntwrk/milaidy/installation") {
      return Response.json({ id: 123, app_id: 1234, account: { login: "rndrntwrk" }, suspended_at: null });
    }
    if (url.pathname === "/app/installations/123/access_tokens") {
      return Response.json({ token: "test-repository-token-long-enough" }, { status: 201 });
    }
    if (url.pathname !== "/repos/rndrntwrk/milaidy/commits/HEAD") throw new Error("Unexpected path");
    headRequests.push(request);
    return redirected
      ? new Response(null, { status: 302, headers: { location: "https://elsewhere.invalid/HEAD" } })
      : Response.json({ sha: "a".repeat(40) });
  });
  const request = () => new Request("http://alice-coding.internal/v1/repository?repository=rndrntwrk%2Fmilaidy");
  try {
    const found = await forwardAliceChatCoding(request(), env);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ ok: true, repository: "rndrntwrk/milaidy", baseCommit: "a".repeat(40) });
    redirected = true;
    const denied = await forwardAliceChatCoding(request(), env);
    expect(denied.status).toBe(503);
    expect(await denied.json()).toEqual({ ok: false, code: "CODING_REPOSITORY_UNAVAILABLE" });
    expect(headRequests).toHaveLength(2);
    expect(headRequests.every((entry) => entry.redirect === "manual")).toBe(true);
  } finally {
    upstream.mockRestore();
  }
});
