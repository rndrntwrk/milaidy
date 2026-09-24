import { createPrivateKey, sign } from "node:crypto";

type GitHubAppEnvironment = {
  ALICE_GITHUB_APP_ID?: string;
  ALICE_GITHUB_APP_PRIVATE_KEY_B64?: string;
};

const REPOSITORY = /^(rndrntwrk|Render-Network-OS)\/([A-Za-z0-9_.-]+)$/;
const COMMIT = /^[a-f0-9]{40}$/;
const MAX_ARCHIVE_BYTES = 100_000_000;

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function appJwt(env: GitHubAppEnvironment, now = Date.now()): string {
  const appId = env.ALICE_GITHUB_APP_ID?.trim();
  const encodedKey = env.ALICE_GITHUB_APP_PRIVATE_KEY_B64?.trim();
  if (!appId || !/^\d+$/.test(appId) || !encodedKey) {
    throw new Error("CODING_GITHUB_APP_UNAVAILABLE");
  }
  const key = createPrivateKey(Buffer.from(encodedKey, "base64").toString("utf8"));
  const issuedAt = Math.floor(now / 1000) - 60;
  const input = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iat: issuedAt,
    exp: issuedAt + 540,
    iss: appId,
  })}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "alice-coding-archive",
    "x-github-api-version": "2022-11-28",
  };
}

async function jsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("CODING_GITHUB_UNAVAILABLE");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CODING_GITHUB_RESPONSE_INVALID");
  }
  return value as Record<string, unknown>;
}

/** Trusted host fetches an immutable archive; no App key or token reaches code. */
export async function fetchAliceCodingArchive(
  repository: string,
  baseCommit: string,
  env: GitHubAppEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const match = REPOSITORY.exec(repository);
  if (!match || repository.length > 191 || match[2] === "." || match[2] === ".." || !COMMIT.test(baseCommit)) {
    throw new Error("CODING_ARCHIVE_TARGET_INVALID");
  }
  const owner = match[1]!;
  const name = match[2]!;
  const jwt = appJwt(env);
  const installation = await jsonResponse(await fetcher(
    `https://api.github.com/repos/${owner}/${name}/installation`,
    { headers: githubHeaders(jwt) },
  ));
  const account = installation.account;
  if (
    typeof installation.id !== "number" ||
    !Number.isSafeInteger(installation.id) ||
    installation.id < 1 ||
    String(installation.app_id) !== env.ALICE_GITHUB_APP_ID?.trim() ||
    !account || typeof account !== "object" ||
    String((account as Record<string, unknown>).login).toLowerCase() !== owner.toLowerCase() ||
    installation.suspended_at !== null
  ) {
    throw new Error("CODING_GITHUB_INSTALLATION_INVALID");
  }
  const scoped = await jsonResponse(await fetcher(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      headers: { ...githubHeaders(jwt), "content-type": "application/json" },
      body: JSON.stringify({
        repositories: [name],
        permissions: { contents: "read", metadata: "read" },
      }),
    },
  ));
  if (typeof scoped.token !== "string" || scoped.token.length < 20) {
    throw new Error("CODING_GITHUB_TOKEN_INVALID");
  }
  const archive = await fetcher(
    `https://api.github.com/repos/${owner}/${name}/tarball/${baseCommit}`,
    { headers: githubHeaders(scoped.token), redirect: "manual" },
  );
  if (archive.status !== 302) throw new Error("CODING_ARCHIVE_UNAVAILABLE");
  const location = archive.headers.get("location");
  if (!location) throw new Error("CODING_ARCHIVE_REDIRECT_INVALID");
  const destination = new URL(location);
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== "codeload.github.com" ||
    !destination.pathname.startsWith(`/${owner}/${name}/`) ||
    !destination.pathname.endsWith(`/${baseCommit}`)
  ) {
    throw new Error("CODING_ARCHIVE_REDIRECT_INVALID");
  }
  const source = await fetcher(destination, { redirect: "error" });
  if (!source.ok || !source.body) throw new Error("CODING_ARCHIVE_UNAVAILABLE");
  const declared = Number(source.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_ARCHIVE_BYTES) {
    throw new Error("CODING_ARCHIVE_TOO_LARGE");
  }
  let received = 0;
  const bounded = source.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_ARCHIVE_BYTES) throw new Error("CODING_ARCHIVE_TOO_LARGE");
      controller.enqueue(chunk);
    },
  }));
  return new Response(bounded, {
    headers: {
      "content-type": "application/gzip",
      "cache-control": "no-store",
      "x-alice-repository": repository,
      "x-alice-base-commit": baseCommit,
    },
  });
}
