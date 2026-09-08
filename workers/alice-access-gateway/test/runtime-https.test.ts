import { expect, mock, test } from "bun:test";

// Only replace the platform boundary; exercise the pinned Container SDK.
class WorkerEntrypoint {
  constructor(
    public ctx: any,
    public env: any,
  ) {}
}
mock.module("cloudflare:workers", () => ({
  DurableObject: WorkerEntrypoint,
  WorkerEntrypoint,
}));

const { ContainerProxy } = await import("@cloudflare/containers");
const { AliceRuntimeContainer } = await import(
  "../src/alice-runtime-container"
);

test("ChatGPT HTTPS reaches the allowlist proxy while other hosts stay denied", async () => {
  const env = Object.fromEntries([
    ...[
      "ACCESS_PROXY_SECRET",
      "RUNTIME_API_TOKEN",
      "RUNTIME_RELEASE_TOKEN",
      "RUNTIME_VAULT_PASSPHRASE",
      "STATE_PLANE_SERVICE_TOKEN",
    ].map((name) => [`ALICE_${name}`, "test-secret-".repeat(4)]),
    ...[
      "PROGRAM_DIGEST",
      "RELEASE_DIGEST",
      "POLICY_HASH",
      "RUNTIME_BUILD_MANIFEST_SHA256",
      "CAPABILITY_BOM_SHA256",
      "DEPLOYMENT_MANIFEST_SHA256",
    ].map((name) => [`ALICE_${name}`, `sha256:${"a".repeat(64)}`]),
    ...["SOURCE_COMMIT", "DEPLOYMENT_CONTROLLER_COMMIT", "ELIZA_COMMIT"].map(
      (name) => [`ALICE_${name}`, "b".repeat(40)],
    ),
    [
      "ALICE_RUNTIME_IMAGE",
      `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"c".repeat(64)}`,
    ],
    ["ALICE_RUNTIME_REVISION", "53"],
  ]);
  const https: Array<{ host: string; proxy: any }> = [];
  const ctx = {
    id: { toString: () => "test-container" },
    storage: { kv: { get() {}, put() {} }, sql: { exec: () => [] } },
    // Lifecycle scheduling is unrelated to interception registration.
    blockConcurrencyWhile() {},
    container: {
      running: false,
      async interceptOutboundHttp() {},
      async interceptAllOutboundHttp() {},
      async interceptOutboundHttps(host: string, proxy: any) {
        https.push({ host, proxy });
      },
    },
    exports: {
      ContainerProxy: ({ props }: any) =>
        new ContainerProxy({ props } as any, env),
    },
  };
  const container = new AliceRuntimeContainer(ctx as any, env as any);
  await (container as any).applyOutboundInterception();
  expect(container.enableInternet).toBe(false);
  const proxy = https.find(({ host }) => host === "*")?.proxy;
  expect(proxy).toBeDefined();

  const originalFetch = globalThis.fetch;
  const destinations: string[] = [];
  globalThis.fetch = (async (request: Request) => {
    destinations.push(request.url);
    return new Response("reached", { status: 202 });
  }) as typeof fetch;
  try {
    expect(
      (
        await proxy.fetch(
          new Request("https://auth.openai.com/oauth/token", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await proxy.fetch(
          new Request("https://chatgpt.com/backend-api/codex/responses", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(202);
    expect(
      (await proxy.fetch(new Request("https://example.com/"))).status,
    ).toBe(520);
    expect(destinations).toHaveLength(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
