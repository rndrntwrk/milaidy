export const ALICE_RUNTIME_CONTAINER_NAME = "alice-production-runtime";
export const ALICE_RUNTIME_CONTAINER_PORT = 2138;
export const ALICE_RUNTIME_STATE_OWNER_ID = "alice-owner-production";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IMAGE =
  /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/;

export type AliceRuntimeContainerEnvironmentSource = {
  ALICE_ACCESS_PROXY_SECRET: string;
  ALICE_RUNTIME_API_TOKEN: string;
  ALICE_RUNTIME_RELEASE_TOKEN: string;
  ALICE_RUNTIME_VAULT_PASSPHRASE: string;
  ALICE_STATE_PLANE_SERVICE_TOKEN: string;
  ALICE_PROGRAM_DIGEST: string;
  ALICE_RELEASE_DIGEST: string;
  ALICE_POLICY_HASH: string;
  ALICE_SOURCE_COMMIT: string;
  ALICE_DEPLOYMENT_CONTROLLER_COMMIT: string;
  ALICE_RUNTIME_IMAGE: string;
  ALICE_RUNTIME_BUILD_MANIFEST_SHA256: string;
  ALICE_CAPABILITY_BOM_SHA256: string;
  ALICE_DEPLOYMENT_MANIFEST_SHA256: string;
  ALICE_ELIZA_COMMIT: string;
  ALICE_RUNTIME_REVISION: string;
};

export function buildAliceRuntimeContainerEnv(
  env: AliceRuntimeContainerEnvironmentSource,
): Record<string, string> {
  const runtimeRevision = Number(env.ALICE_RUNTIME_REVISION);
  if (
    [
      env.ALICE_ACCESS_PROXY_SECRET,
      env.ALICE_RUNTIME_API_TOKEN,
      env.ALICE_RUNTIME_RELEASE_TOKEN,
      env.ALICE_RUNTIME_VAULT_PASSPHRASE,
      env.ALICE_STATE_PLANE_SERVICE_TOKEN,
    ].some((value) => typeof value !== "string" || value.length < 32) ||
    ![
      env.ALICE_PROGRAM_DIGEST,
      env.ALICE_RELEASE_DIGEST,
      env.ALICE_POLICY_HASH,
      env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
      env.ALICE_CAPABILITY_BOM_SHA256,
      env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    ].every((value) => DIGEST.test(value)) ||
    ![
      env.ALICE_SOURCE_COMMIT,
      env.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
      env.ALICE_ELIZA_COMMIT,
    ].every((value) => COMMIT.test(value)) ||
    !IMAGE.test(env.ALICE_RUNTIME_IMAGE) ||
    !Number.isSafeInteger(runtimeRevision) ||
    runtimeRevision <= 0
  ) {
    throw new Error("ALICE_RUNTIME_CONTAINER_ENV_INVALID");
  }
  return {
    NODE_ENV: "production",
    PORT: String(ALICE_RUNTIME_CONTAINER_PORT),
    APP_PORT: String(ALICE_RUNTIME_CONTAINER_PORT),
    APP_API_BIND: "0.0.0.0",
    MILADY_API_BIND: "0.0.0.0",
    ELIZA_API_BIND: "0.0.0.0",
    ELIZA_AUTH_DISABLED: "0",
    MILADY_CLOUD_PROVISIONED: "1",
    MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
    MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET: env.ALICE_ACCESS_PROXY_SECRET,
    MILADY_API_TOKEN: env.ALICE_RUNTIME_API_TOKEN,
    MILADY_ALLOWED_ORIGINS: "https://alice.rndrntwrk.com",
    ELIZA_ALLOWED_ORIGINS: "https://alice.rndrntwrk.com",
    // The OpenAI-compatible client requires this field, but the URL below is
    // intercepted by ContainerProxy and can only reach the bound Alice gateway.
    OPENAI_API_KEY: env.ALICE_RUNTIME_RELEASE_TOKEN,
    OPENAI_BASE_URL: "http://alice-ai-gateway.internal/v1",
    OPENAI_EMBEDDING_URL: "http://alice-ai-gateway.internal/v1",
    MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
    ELIZA_DISABLE_LOCAL_EMBEDDINGS: "1",
    ALICE_STATE_PLANE_URL:
      "http://alice-state-plane.internal/v1/eliza-database",
    ALICE_COMPANION_STATE_URL:
      "http://alice-state-plane.internal/v1/companion-state",
    ALICE_STATE_OWNER_ID: ALICE_RUNTIME_STATE_OWNER_ID,
    ELIZA_VAULT_PASSPHRASE: env.ALICE_RUNTIME_VAULT_PASSPHRASE,
    ALICE_RUNTIME_PROFILE: "full-gated",
    ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
    ENABLE_AUTONOMY: "false",
    ELIZA_TRIGGERS_ENABLED: "false",
    ALICE_PROGRAM_DIGEST: env.ALICE_PROGRAM_DIGEST,
    ALICE_RELEASE_DIGEST: env.ALICE_RELEASE_DIGEST,
    ALICE_POLICY_HASH: env.ALICE_POLICY_HASH,
    ALICE_SOURCE_COMMIT: env.ALICE_SOURCE_COMMIT,
    ALICE_DEPLOYMENT_CONTROLLER_COMMIT: env.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
    ALICE_RUNTIME_IMAGE: env.ALICE_RUNTIME_IMAGE,
    ALICE_RUNTIME_BUILD_MANIFEST_SHA256:
      env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
    ALICE_CAPABILITY_BOM_SHA256: env.ALICE_CAPABILITY_BOM_SHA256,
    ALICE_DEPLOYMENT_MANIFEST_SHA256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    ALICE_ELIZA_COMMIT: env.ALICE_ELIZA_COMMIT,
    ALICE_RUNTIME_REVISION: env.ALICE_RUNTIME_REVISION,
  };
}

export type AliceRuntimeContainerNamespace = {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
};

export type AliceRuntimeAiGatewayEnvironment = {
  ALICE_RUNTIME_RELEASE_TOKEN: string;
  ALICE_AI_GATEWAY: { fetch(request: Request): Promise<Response> };
};

function isFetchBinding(
  value: unknown,
): value is { fetch(request: Request): Promise<Response> } {
  return (
    value !== null &&
    typeof value === "object" &&
    "fetch" in value &&
    typeof value.fetch === "function"
  );
}

function readAliceRuntimeAiGatewayEnvironment(
  value: unknown,
): AliceRuntimeAiGatewayEnvironment {
  if (
    value === null ||
    typeof value !== "object" ||
    !("ALICE_RUNTIME_RELEASE_TOKEN" in value) ||
    typeof value.ALICE_RUNTIME_RELEASE_TOKEN !== "string" ||
    value.ALICE_RUNTIME_RELEASE_TOKEN.length < 32 ||
    !("ALICE_AI_GATEWAY" in value) ||
    !isFetchBinding(value.ALICE_AI_GATEWAY)
  ) {
    throw new Error("ALICE_AI_GATEWAY_FORWARD_INVALID");
  }
  return {
    ALICE_RUNTIME_RELEASE_TOKEN: value.ALICE_RUNTIME_RELEASE_TOKEN,
    ALICE_AI_GATEWAY: value.ALICE_AI_GATEWAY,
  };
}

export function forwardToAliceAiGateway(
  request: Request,
  env: unknown,
): Promise<Response> {
  const runtimeEnv = readAliceRuntimeAiGatewayEnvironment(env);
  const headers = new Headers(request.headers);
  headers.set(
    "authorization",
    `Bearer ${runtimeEnv.ALICE_RUNTIME_RELEASE_TOKEN}`,
  );
  return runtimeEnv.ALICE_AI_GATEWAY.fetch(new Request(request, { headers }));
}

export type AliceRuntimeStatePlaneEnvironment = {
  ALICE_STATE_PLANE_SERVICE_TOKEN: string;
  ALICE_STATE_PLANE: { fetch(request: Request): Promise<Response> };
};

export function forwardToAliceStatePlane(
  request: Request,
  env: unknown,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (
    env === null ||
    typeof env !== "object" ||
    !("ALICE_STATE_PLANE_SERVICE_TOKEN" in env) ||
    typeof env.ALICE_STATE_PLANE_SERVICE_TOKEN !== "string" ||
    env.ALICE_STATE_PLANE_SERVICE_TOKEN.length < 32 ||
    !("ALICE_STATE_PLANE" in env) ||
    !isFetchBinding(env.ALICE_STATE_PLANE) ||
    request.method !== "POST" ||
    (pathname !== "/v1/eliza-database" && pathname !== "/v1/companion-state")
  ) {
    throw new Error("ALICE_STATE_PLANE_FORWARD_INVALID");
  }
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("origin");
  headers.delete("x-alice-container-state-scope");
  headers.delete("x-alice-state-owner");
  headers.set("x-alice-state-token", env.ALICE_STATE_PLANE_SERVICE_TOKEN);
  headers.set(
    "x-alice-container-state-scope",
    pathname === "/v1/eliza-database" ? "eliza-database" : "companion-stage",
  );
  headers.set("x-alice-state-owner", ALICE_RUNTIME_STATE_OWNER_ID);
  const upstreamUrl = new URL(request.url);
  if (pathname === "/v1/companion-state") upstreamUrl.pathname = "/v1/state";
  return env.ALICE_STATE_PLANE.fetch(
    new Request(new Request(upstreamUrl, request), { headers }),
  );
}

export function fetchAliceRuntimeContainer(
  namespace: AliceRuntimeContainerNamespace,
  request: Request,
): Promise<Response> {
  return namespace.getByName(ALICE_RUNTIME_CONTAINER_NAME).fetch(request);
}
