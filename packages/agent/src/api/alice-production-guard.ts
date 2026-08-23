type AliceProductionGuardEnv = Pick<
  NodeJS.ProcessEnv,
  "ALICE_RUNTIME_AUTHORITY_MODE"
>;

export type AliceProductionRequestDecision =
  | { allowed: true }
  | { allowed: false; code: "ALICE_PRODUCTION_MUTATION_DENIED" };

const SAFE_READ_PATHS = [
  /^\/$/,
  /^\/api\/health$/,
  /^\/health(?:\/(?:live|ready))?$/,
  /^\/api\/alice-production\/proof$/,
  /^\/api\/agent\/status$/,
  /^\/api\/emotes$/,
  /^\/api\/avatar\/(?:vrm|background)$/,
  /^\/api\/companion\/stage$/,
  /^\/v1\/models(?:\/[^/]+)?$/,
];

const SAFE_WRITE_PATHS = [
  /^\/v1\/chat\/completions$/,
];

function matches(pathname: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(pathname));
}

export function isAliceProductionRuntime(
  env: AliceProductionGuardEnv = process.env,
): boolean {
  return env.ALICE_RUNTIME_AUTHORITY_MODE?.trim() === "proposer-only";
}

export function shouldStartOptionalRuntimeSubsystems(
  env: AliceProductionGuardEnv = process.env,
): boolean {
  return !isAliceProductionRuntime(env);
}

export function isAliceProductionRequestAuthenticated(input: {
  authDisabled: boolean;
  trustedProxyAuthenticated: boolean;
  bearerConfigured: boolean;
  bearerMatches: boolean;
}): boolean {
  if (input.authDisabled) return false;
  if (input.trustedProxyAuthenticated) return true;
  return input.bearerConfigured && input.bearerMatches;
}

export function isAliceProductionChatIngressAuthenticated(
  trustedProxyAuthenticated: boolean,
): boolean {
  return trustedProxyAuthenticated;
}

/**
 * Alice's production Milady process is a proposer, not an authority plane.
 * Keep the first release surface deliberately narrow: static application
 * assets, bounded read APIs, and chat/conversation writes only. Every other
 * API mutation (plugins, configuration, custody, streaming, coding, shell,
 * cloud, connectors, or administration) fails closed inside the runtime even
 * after ingress authentication succeeds.
 */
export function evaluateAliceProductionRequest(
  method: string,
  pathname: string,
  env: AliceProductionGuardEnv = process.env,
): AliceProductionRequestDecision {
  if (!isAliceProductionRuntime(env)) return { allowed: true };

  const normalizedMethod = method.trim().toUpperCase();
  if (normalizedMethod === "OPTIONS") return { allowed: true };

  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    if (matches(pathname, SAFE_READ_PATHS)) return { allowed: true };

    // The built dashboard's immutable files are safe to serve to an already
    // authenticated owner. API, WebSocket, and broadcast namespaces never
    // fall through this static-file allowance.
    if (
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/v1") &&
      !pathname.startsWith("/ws") &&
      !pathname.startsWith("/broadcast")
    ) {
      return { allowed: true };
    }
  }

  if (normalizedMethod === "POST" && matches(pathname, SAFE_WRITE_PATHS)) {
    return { allowed: true };
  }

  return { allowed: false, code: "ALICE_PRODUCTION_MUTATION_DENIED" };
}
