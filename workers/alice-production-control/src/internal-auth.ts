import type {
  AliceDeploymentPauseConfigSource,
  AliceInternalServiceConfigSource,
} from "./runtime-config";

export type AliceInternalService = "access-gateway" | "ai-gateway";

const encoder = new TextEncoder();

function fixedStringEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const width = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < width; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

export function authorizeEmergencyRecovery(
  presentedToken: string,
  config: AliceDeploymentPauseConfigSource,
): boolean {
  const recovery = config.ALICE_CONTROL_RECOVERY_TOKEN;
  const deploymentPause = config.ALICE_DEPLOYMENT_PAUSE_TOKEN;
  const access = config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN;
  const ai = config.ALICE_AI_GATEWAY_SERVICE_TOKEN;
  if (
    typeof recovery !== "string" ||
    recovery.length < 32 ||
    recovery === deploymentPause ||
    recovery === access ||
    recovery === ai
  ) {
    return false;
  }
  return fixedStringEqual(presentedToken, recovery);
}

export function authorizeDeploymentPause(
  presentedToken: string,
  config: AliceDeploymentPauseConfigSource,
): boolean {
  const deploymentPause = config.ALICE_DEPLOYMENT_PAUSE_TOKEN;
  const recovery = config.ALICE_CONTROL_RECOVERY_TOKEN;
  const access = config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN;
  const ai = config.ALICE_AI_GATEWAY_SERVICE_TOKEN;
  if (
    typeof deploymentPause !== "string" ||
    deploymentPause.length < 32 ||
    deploymentPause === recovery ||
    deploymentPause === access ||
    deploymentPause === ai
  ) {
    return false;
  }
  return fixedStringEqual(presentedToken, deploymentPause);
}

export function requiredInternalService(
  method: string,
  path: string,
): AliceInternalService | null {
  if (
    method === "GET" &&
    (path === "/control/internal/v1/health" ||
      path === "/control/internal/v1/runtime/admit" ||
      /^\/control\/internal\/v1\/sessions\/[^/]+\/conversation\/context$/.test(path))
  ) {
    return "access-gateway";
  }
  if (method === "GET" && path === "/control/internal/v1/model/binding") {
    return "ai-gateway";
  }
  if (
    method === "POST" &&
    /^\/control\/internal\/v1\/sessions\/[^/]+\/conversation\/turn$/.test(path)
  ) {
    return "access-gateway";
  }
  if (method === "POST" && path === "/control/internal/v1/model/reserve") {
    return "ai-gateway";
  }
  return null;
}

export function authorizeInternalService(
  service: AliceInternalService,
  presentedToken: string,
  config: AliceInternalServiceConfigSource,
): boolean {
  const expected = service === "access-gateway"
    ? config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN
    : config.ALICE_AI_GATEWAY_SERVICE_TOKEN;
  const other = service === "access-gateway"
    ? config.ALICE_AI_GATEWAY_SERVICE_TOKEN
    : config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN;
  if (
    typeof expected !== "string" ||
    expected.length < 32 ||
    (typeof other === "string" && expected === other)
  ) {
    return false;
  }
  return fixedStringEqual(presentedToken, expected);
}
