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

const ALICE_RUNTIME_OUTBOUND_BY_HOST = {
  "alice-ai-gateway.internal": forwardToAliceAiGateway,
  "alice-state-plane.internal": forwardToAliceStatePlane,
};

const ALICE_RUNTIME_ALLOWED_HOSTS = [
  ...Object.keys(ALICE_RUNTIME_OUTBOUND_BY_HOST),
  "auth.openai.com",
  "chatgpt.com",
  "stream.rndrntwrk.com",
  "api.telegram.org",
  "discord.com",
  "gateway.discord.gg",
  // Discord's Ready event supplies a regional gateway for session resumption.
  "gateway-*.discord.gg",
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
  constructor(
    ctx: DurableObjectState<Record<string, never>>,
    env: AliceRuntimeContainerEnv,
  ) {
    super(ctx, env);
    this.envVars = buildAliceRuntimeContainerEnv(env);
  }
}

AliceRuntimeContainer.outboundByHost = ALICE_RUNTIME_OUTBOUND_BY_HOST;
