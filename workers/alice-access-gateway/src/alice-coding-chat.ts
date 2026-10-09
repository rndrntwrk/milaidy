import { parseNativeCodingRequest } from "../../alice-production-control/src/coding-chat";
import { authorityDurableName } from "../../alice-production-control/src/durable-names";
import {
  codingRepositoryToken,
  githubHeaders,
  githubJsonResponse,
} from "./alice-coding-archive";

/** Only authenticated native owner-handler requests can start draft PR work. */
export async function forwardAliceChatCoding(
  request: Request,
  env: unknown,
): Promise<Response> {
  const url = new URL(request.url);
  const task =
    /^\/v1\/tasks\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      url.pathname,
    );
  const create = url.pathname === "/v1/tasks" && request.method === "POST";
  const repository =
    url.pathname === "/v1/repository" && request.method === "GET";
  if (
    url.hostname !== "alice-coding.internal" ||
    (url.search && !repository) ||
    !(create || (task && request.method === "GET") || repository)
  ) {
    return new Response("Not found", { status: 404 });
  }
  if (!env || typeof env !== "object")
    throw new Error("CODING_CHAT_HOST_UNAVAILABLE");
  if (repository) {
    if (
      !("ALICE_GITHUB_APP_ID" in env) ||
      typeof env.ALICE_GITHUB_APP_ID !== "string" ||
      !("ALICE_GITHUB_APP_PRIVATE_KEY_B64" in env) ||
      typeof env.ALICE_GITHUB_APP_PRIVATE_KEY_B64 !== "string"
    ) {
      return Response.json(
        { ok: false, code: "CODING_GITHUB_APP_UNAVAILABLE" },
        { status: 503 },
      );
    }
    try {
      const name = url.searchParams.get("repository") ?? "";
      const token = await codingRepositoryToken(
        name,
        { contents: "read", metadata: "read" },
        {
          ALICE_GITHUB_APP_ID: env.ALICE_GITHUB_APP_ID,
          ALICE_GITHUB_APP_PRIVATE_KEY_B64:
            env.ALICE_GITHUB_APP_PRIVATE_KEY_B64,
        },
        fetch,
      );
      const head = await githubJsonResponse(
        await fetch(`https://api.github.com/repos/${name}/commits/HEAD`, {
          headers: githubHeaders(token),
          redirect: "error",
        }),
      );
      if (typeof head.sha !== "string" || !/^[a-f0-9]{40}$/.test(head.sha))
        throw new Error("CODING_BASE_INVALID");
      return Response.json({
        ok: true,
        repository: name,
        baseCommit: head.sha,
      });
    } catch {
      return Response.json(
        { ok: false, code: "CODING_REPOSITORY_UNAVAILABLE" },
        { status: 503 },
      );
    }
  }
  if (
    !("ALICE_AUTHORITY" in env) ||
    !env.ALICE_AUTHORITY ||
    typeof env.ALICE_AUTHORITY !== "object" ||
    !("getByName" in env.ALICE_AUTHORITY) ||
    typeof env.ALICE_AUTHORITY.getByName !== "function"
  ) {
    throw new Error("CODING_CHAT_HOST_UNAVAILABLE");
  }
  let raw: string | undefined;
  if (create) {
    if (
      !("ALICE_RUNTIME_API_TOKEN" in env) ||
      typeof env.ALICE_RUNTIME_API_TOKEN !== "string" ||
      env.ALICE_RUNTIME_API_TOKEN.length < 32
    ) {
      return Response.json(
        { ok: false, code: "CODING_NATIVE_AUTH_UNAVAILABLE" },
        { status: 503 },
      );
    }
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65_536)
      return Response.json(
        { ok: false, code: "CODING_REQUEST_TOO_LARGE" },
        { status: 413 },
      );
    const signature = request.headers.get("x-alice-native-coding-signature");
    if (!signature || !/^[a-f0-9]{64}$/.test(signature))
      return Response.json(
        { ok: false, code: "CODING_NATIVE_AUTH_DENIED" },
        { status: 403 },
      );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.ALICE_RUNTIME_API_TOKEN),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from({ length: 32 }, (_, index) =>
        Number.parseInt(signature.slice(index * 2, index * 2 + 2), 16),
      ),
      new TextEncoder().encode(`alice.native-coding.v1\n${raw}`),
    );
    if (!verified)
      return Response.json(
        { ok: false, code: "CODING_NATIVE_AUTH_DENIED" },
        { status: 403 },
      );
    try {
      const native = parseNativeCodingRequest(JSON.parse(raw));
      if (
        native.issuedAt < Date.now() - 300_000 ||
        native.issuedAt > Date.now() + 30_000
      )
        throw new Error("stale");
    } catch {
      return Response.json(
        { ok: false, code: "CODING_NATIVE_REQUEST_INVALID" },
        { status: 403 },
      );
    }
  }
  // No incoming owner, scope, cookies, or authority service headers are forwarded.
  return env.ALICE_AUTHORITY.getByName(authorityDurableName()).fetch(
    new Request(
      `https://alice.internal${create ? "/coding/chat/start" : `/coding/chat${url.pathname.slice(3)}`}`,
      {
        method: request.method,
        headers: { "content-type": "application/json" },
        ...(raw === undefined ? {} : { body: raw }),
      },
    ),
  );
}
