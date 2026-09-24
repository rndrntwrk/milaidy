import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "bun:test";
import { aliceCodingArgumentHash } from "../../alice-production-control/src/coding-task";
import {
  aliceCodingResultSha256, signAliceCodingPublish,
} from "../../alice-production-control/src/coding-publish-signature";
import { publishAliceCodingTask } from "../src/alice-coding-publish";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const token = "alice-coding-publish-test-secret-with-at-least-32-bytes";
const repository = "Render-Network-OS/555-bot";
const baseCommit = "a".repeat(40);
const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const admission = {
  binding, deploymentManifestSha256: `sha256:${"4".repeat(64)}`,
  admissionGeneration: 7,
};
const taskId = "task-cap-00000000-0000-4000-8000-000000000001";
const actor = `owner:sha256:${"5".repeat(64)}`;
const branch = `alice/${taskId}`;

async function input() {
  const requestedAt = Date.now() - 1_000;
  const coding = {
    repository, baseCommit, prompt: "Repair Telegram commands.",
    delivery: "pull-request" as const,
  };
  const result = {
    summary: "Repair command parsing and add focused coverage.",
    changes: [{ path: "src/telegram.ts", mode: "100644", contentB64: "ZXhwb3J0IHt9Owo=" }],
  };
  return {
    schemaVersion: "alice.coding-publish.v1",
    taskId, actor, admission, coding, branch, requestedAt,
    intent: {
      intentId: "intent-cap-00000000-0000-4000-8000-000000000001",
      action: "coding.pr.create", target: repository,
      argumentHash: await aliceCodingArgumentHash(coding),
      nonce: "nonce-cap-00000000-0000-4000-8000-000000000001",
      expiresAt: requestedAt + 600_000,
      capabilityId: taskId.slice(5), ...binding,
    },
    resultSha256: await aliceCodingResultSha256(result), result,
  };
}

function fixture(authorized = true) {
  let branchSha: string | null = null;
  let pull: Record<string, unknown> | null = null;
  let branchCreates = 0;
  let pullCreates = 0;
  let githubCalls = 0;
  const env = {
    ALICE_CODING_PUBLISH_TOKEN: token,
    ALICE_GITHUB_APP_ID: "5052363",
    ALICE_GITHUB_APP_PRIVATE_KEY_B64: Buffer.from(
      privateKey.export({ type: "pkcs1", format: "pem" }),
    ).toString("base64"),
    ALICE_AUTHORITY: {
      getByName() {
        return { async fetch(request: Request | string) {
          const path = new URL(typeof request === "string" ? request : request.url).pathname;
          if (path === "/release/check") return Response.json({
            allowed: true, admissionGeneration: admission.admissionGeneration,
            binding, release: { deploymentManifestSha256: admission.deploymentManifestSha256 },
          });
          if (path === "/authorize") return Response.json({
            decision: { allowed: authorized, code: authorized
              ? "INTENT_ALREADY_AUTHORIZED" : "CAPABILITY_REVOKED" },
          });
          throw new Error("unexpected authority call");
        } };
      },
    },
  };
  const fetcher = (async (request: string | URL | Request, init?: RequestInit) => {
    githubCalls += 1;
    const url = new URL(String(request));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    if (path === `/repos/${repository}/installation`) return Response.json({
      id: 164209774, app_id: 5052363, account: { login: "Render-Network-OS" },
      suspended_at: null,
    });
    if (path === "/app/installations/164209774/access_tokens") {
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: ["555-bot"],
        permissions: { contents: "write", metadata: "read", pull_requests: "write" },
      });
      return Response.json({ token: "ghs_one-repository-write-token" });
    }
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer ghs_one-repository-write-token",
    );
    if (path === `/repos/${repository}`) return Response.json({ default_branch: "main", archived: false });
    if (path === `/repos/${repository}/git/commits/${baseCommit}`) return Response.json({
      tree: { sha: "b".repeat(40) },
    });
    if (path === `/repos/${repository}/git/ref/heads/${branch}`) return branchSha
      ? Response.json({ object: { sha: branchSha } })
      : Response.json({ message: "Not found" }, { status: 404 });
    if (path === `/repos/${repository}/branches/main`) return Response.json({ commit: { sha: baseCommit } });
    if (path === `/repos/${repository}/git/blobs` && method === "POST") return Response.json({ sha: "c".repeat(40) });
    if (path === `/repos/${repository}/git/trees` && method === "POST") return Response.json({ sha: "d".repeat(40) });
    if (path === `/repos/${repository}/git/commits` && method === "POST") return Response.json({ sha: "e".repeat(40) });
    if (path === `/repos/${repository}/git/refs` && method === "POST") {
      branchCreates += 1;
      branchSha = "e".repeat(40);
      expect(JSON.parse(String(init?.body))).toEqual({ ref: `refs/heads/${branch}`, sha: branchSha });
      return Response.json({ ref: `refs/heads/${branch}` }, { status: 201 });
    }
    if (path === `/repos/${repository}/pulls` && method === "GET") return Response.json(pull ? [pull] : []);
    if (path === `/repos/${repository}/pulls` && method === "POST") {
      pullCreates += 1;
      expect(JSON.parse(String(init?.body))).toMatchObject({
        head: branch, base: "main", draft: true,
      });
      pull = {
        number: 17, html_url: `https://github.com/${repository}/pull/17`,
        head: { ref: branch, sha: branchSha }, base: { ref: "main" },
      };
      return Response.json(pull, { status: 201 });
    }
    throw new Error(`unexpected GitHub call ${method} ${url}`);
  }) as typeof fetch;
  return { env, fetcher, counts: () => ({ branchCreates, pullCreates, githubCalls }) };
}

async function request(value: unknown, signingToken = token): Promise<Request> {
  const body = JSON.stringify(value);
  return new Request("https://alice-runtime-host.internal/internal/v1/coding/publish", {
    method: "POST", headers: {
      "x-alice-coding-signature": await signAliceCodingPublish(body, signingToken),
    }, body,
  });
}

test("one approved task creates one task-owned draft PR and a replay returns it", async () => {
  const value = await input();
  const state = fixture();
  const first = await publishAliceCodingTask(await request(value), state.env as any, state.fetcher);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ ok: true, result: {
    branch, commitSha: "e".repeat(40), baseCommit,
    pullRequestUrl: `https://github.com/${repository}/pull/17`,
  } });
  const second = await publishAliceCodingTask(await request(value), state.env as any, state.fetcher);
  expect(second.status).toBe(200);
  expect(state.counts()).toMatchObject({ branchCreates: 1, pullCreates: 1 });
});

test("wrong, expired, patch-only and altered task authority cannot publish", async () => {
  const value = await input();
  const state = fixture(false);
  const denied = await publishAliceCodingTask(await request(value), state.env as any, state.fetcher);
  expect((await denied.json() as any).code).toBe("CODING_PUBLISH_AUTH_DENIED");
  expect(state.counts().githubCalls).toBe(0);
  for (const changed of [
    { ...value, intent: { ...value.intent, expiresAt: Date.now() - 1 } },
    { ...value, intent: { ...value.intent, action: "coding.patch.sandbox" } },
    { ...value, result: { ...value.result, changes: [{ ...value.result.changes[0], contentB64: "YQ==" }] } },
  ]) {
    const response = await publishAliceCodingTask(await request(changed), fixture().env as any, state.fetcher);
    expect((await response.json() as any).code).toBe("CODING_PUBLISH_REQUEST_INVALID");
  }
  expect(state.counts().githubCalls).toBe(0);
  const wrongSignature = await publishAliceCodingTask(await request(value, "wrong-secret-with-at-least-32-characters"),
    fixture().env as any, state.fetcher);
  expect(wrongSignature.status).toBe(403);
});
