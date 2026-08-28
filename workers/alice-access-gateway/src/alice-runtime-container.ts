import { Container } from "@cloudflare/containers";
import {
  ALICE_RUNTIME_CONTAINER_PORT,
  buildAliceRuntimeContainerEnv,
  forwardToAliceAiGateway,
  type AliceRuntimeContainerEnvironmentSource,
} from "./alice-runtime-host";

type AliceRuntimeContainerEnv = AliceRuntimeContainerEnvironmentSource & {
  ALICE_AI_GATEWAY: Fetcher;
};

export class AliceRuntimeContainer extends Container<AliceRuntimeContainerEnv> {
  static outboundByHost = {
    "alice-ai-gateway.internal": forwardToAliceAiGateway,
  };
  defaultPort = ALICE_RUNTIME_CONTAINER_PORT;
  requiredPorts = [ALICE_RUNTIME_CONTAINER_PORT];
  sleepAfter = "10m";
  enableInternet = false;
  pingEndpoint = "/health/live";
  constructor(ctx: DurableObjectState<{}>, env: AliceRuntimeContainerEnv) {
    super(ctx, env);
    this.envVars = buildAliceRuntimeContainerEnv(env);
  }
}
