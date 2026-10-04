import { Container } from "@cloudflare/containers";
import {
  ALICE_RUNTIME_CONTAINER_PORT,
  type AliceRuntimeContainerEnvironmentSource,
  buildAliceRuntimeContainerEnv,
  forwardToAliceAiGateway,
  forwardToAliceStatePlane,
} from "./alice-runtime-host";

type AliceRuntimeContainerEnv = AliceRuntimeContainerEnvironmentSource & {
  ALICE_AI_GATEWAY: Fetcher;
  ALICE_STATE_PLANE: Fetcher;
};

async function forwardToDiscordGateway(request: Request): Promise<Response> {
  const response = await fetch(request);
  const clientKey = request.headers.get("sec-websocket-key");
  if (response.status !== 101 || !response.webSocket || !clientKey) {
    return response;
  }
  // Workers creates its own upstream handshake key. The container's HTTP
  // client must receive the acceptance value for its original key instead.
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(
      `${clientKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
    ),
  );
  const headers = new Headers(response.headers);
  // Cloudflare adds these when serializing a WebSocket response to the
  // container. Keeping them here duplicates their values on the wire.
  headers.delete("upgrade");
  headers.delete("connection");
  headers.set(
    "sec-websocket-accept",
    btoa(String.fromCharCode(...new Uint8Array(digest))),
  );
  return new Response(null, {
    status: 101,
    headers,
    webSocket: response.webSocket,
  });
}

const ALICE_RUNTIME_OUTBOUND_BY_HOST = {
  "alice-ai-gateway.internal": forwardToAliceAiGateway,
  "alice-state-plane.internal": forwardToAliceStatePlane,
  "gateway.discord.gg": forwardToDiscordGateway,
  // Discord's Ready event supplies a regional gateway for session resumption.
  "gateway-*.discord.gg": forwardToDiscordGateway,
};

const ALICE_RUNTIME_ALLOWED_HOSTS = [
  ...Object.keys(ALICE_RUNTIME_OUTBOUND_BY_HOST),
  "auth.openai.com",
  "chatgpt.com",
  "stream.rndrntwrk.com",
  "api.telegram.org",
  "api.github.com",
  "github.com",
  "discord.com",
];

export class AliceRuntimeContainer extends Container<AliceRuntimeContainerEnv> {
  defaultPort = ALICE_RUNTIME_CONTAINER_PORT;
  requiredPorts = [ALICE_RUNTIME_CONTAINER_PORT];
  sleepAfter = "10m";
  enableInternet = false;
  // HTTPS must reach ContainerProxy for the host allowlist to apply.
  interceptHttps = true;
  allowedHosts = ALICE_RUNTIME_ALLOWED_HOSTS;
  pingEndpoint = "/health/live";

  override async onActivityExpired(): Promise<void> {
    // Native bot connections must remain available when the owner UI is closed.
  }

  constructor(
    ctx: DurableObjectState<Record<string, never>>,
    env: AliceRuntimeContainerEnv,
  ) {
    super(ctx, env);
    this.envVars = buildAliceRuntimeContainerEnv(env);
  }
}

AliceRuntimeContainer.outboundByHost = ALICE_RUNTIME_OUTBOUND_BY_HOST;
