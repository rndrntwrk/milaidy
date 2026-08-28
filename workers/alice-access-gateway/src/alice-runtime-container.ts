import { Container } from "@cloudflare/containers";
import { ALICE_RUNTIME_CONTAINER_PORT } from "./alice-runtime-host";

export class AliceRuntimeContainer extends Container {
  defaultPort = ALICE_RUNTIME_CONTAINER_PORT;
  requiredPorts = [ALICE_RUNTIME_CONTAINER_PORT];
  sleepAfter = "10m";
  enableInternet = false;
  pingEndpoint = "/health/live";
  envVars = {
    NODE_ENV: "production",
    PORT: String(ALICE_RUNTIME_CONTAINER_PORT),
    APP_PORT: String(ALICE_RUNTIME_CONTAINER_PORT),
    APP_API_BIND: "0.0.0.0",
    MILADY_API_BIND: "0.0.0.0",
    ELIZA_API_BIND: "0.0.0.0",
    ALICE_RUNTIME_PROFILE: "full-gated",
    ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
    ENABLE_AUTONOMY: "false",
    ELIZA_TRIGGERS_ENABLED: "false",
  };
}
