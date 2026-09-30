import { expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { fetchAliceCodingArchive } from "../src/alice-coding-archive";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  ALICE_GITHUB_APP_ID: "5052363",
  ALICE_GITHUB_APP_PRIVATE_KEY_B64: Buffer.from(
    privateKey.export({ type: "pkcs1", format: "pem" }),
  ).toString("base64"),
};
const repository = "Render-Network-OS/555-bot";
const baseCommit = "a".repeat(40);

test("trusted host fetches exact SHA with a one-repository read token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1) {
      const jwt = String((init?.headers as Record<string, string>).authorization).slice(7);
      const [header, payload, signature] = jwt.split(".");
      expect(JSON.parse(Buffer.from(payload!, "base64url").toString()).iss).toBe("5052363");
      expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey,
        Buffer.from(signature!, "base64url"))).toBe(true);
      return Response.json({ id: 164209774, app_id: 5052363,
        account: { login: "Render-Network-OS" }, suspended_at: null });
    }
    if (calls.length === 2) {
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: ["555-bot"],
        permissions: { contents: "read", metadata: "read" },
      });
      return Response.json({ token: "ghs_test-repository-scoped-token" });
    }
    if (calls.length === 3) {
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer ghs_test-repository-scoped-token",
      );
      return new Response(null, { status: 302, headers: {
        location: `https://codeload.github.com/${repository}/legacy.tar.gz/${baseCommit}`,
      } });
    }
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBeUndefined();
    expect(init?.redirect).toBe("manual");
    return new Response("archive bytes", { status: 200,
      headers: { "content-length": "282698666" } });
  }) as typeof fetch;
  const response = await fetchAliceCodingArchive(repository, baseCommit, env, fetcher);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("archive bytes");
  expect(calls).toHaveLength(4);
  expect(calls[3]?.url).toBe(`https://codeload.github.com/${repository}/legacy.tar.gz/${baseCommit}`);
});

test("archive download rejects a further redirect without following it", async () => {
  const responses = [
    Response.json({ id: 164209774, app_id: 5052363,
      account: { login: "Render-Network-OS" }, suspended_at: null }),
    Response.json({ token: "ghs_test-repository-scoped-token" }),
    new Response(null, { status: 302, headers: {
      location: `https://codeload.github.com/${repository}/legacy.tar.gz/${baseCommit}`,
    } }),
    new Response(null, { status: 302, headers: {
      location: "https://other.example/archive",
    } }),
  ];
  let calls = 0;
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    const response = responses[calls++];
    if (!response) throw new Error("unexpected redirect follow");
    expect(init?.redirect === "follow").toBe(false);
    return response;
  }) as typeof fetch;
  await expect(fetchAliceCodingArchive(repository, baseCommit, env, fetcher))
    .rejects.toThrow("CODING_ARCHIVE_UNAVAILABLE");
  expect(calls).toBe(4);
});

test("archive source rejects unauthorized targets before GitHub", async () => {
  const neverFetch = (async () => { throw new Error("unexpected fetch"); }) as typeof fetch;
  await expect(fetchAliceCodingArchive("OtherOrg/private", baseCommit, env, neverFetch))
    .rejects.toThrow("CODING_ARCHIVE_TARGET_INVALID");
});
