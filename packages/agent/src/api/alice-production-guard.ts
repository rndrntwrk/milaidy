import {
  type AliceRuntimeProfileEnv,
  isAliceFullRuntimeProfile,
  isAliceProductionRuntime,
  isAliceResponseOnlyRuntime,
} from "../runtime/alice-runtime-profile.js";

type AliceProductionGuardEnv = AliceRuntimeProfileEnv;

export {
  isAliceFullRuntimeProfile,
  isAliceProductionRuntime,
  isAliceResponseOnlyRuntime,
};

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

const SAFE_WRITE_PATHS = [/^\/v1\/chat\/completions$/];

const FULL_PROFILE_ALLOWED_READ_PATHS = [
  /^\/$/,
  /^\/companion$/,
  /^\/broadcast\/[a-zA-Z0-9-]+$/,
  /^\/(?:assets|vrms|models|fonts|icons|images|sounds|audio)\/[a-zA-Z0-9._/-]+$/,
  /^\/(?:favicon\.ico|manifest\.webmanifest)$/,
  /^\/api\/health$/,
  /^\/health(?:\/(?:live|ready))?$/,
  /^\/api\/alice-production\/proof$/,
  /^\/api\/(?:auth\/status|status|agent\/status|onboarding\/status|config|emotes)$/,
  /^\/api\/avatar\/(?:vrm|background)$/,
  /^\/api\/companion\/stage$/,
  /^\/api\/broadcast\/[a-zA-Z0-9-]+\/(?:stage|scene|vrm|background)$/,
  /^\/api\/conversations(?:\/[^/]+\/messages)?$/,
  /^\/api\/memories\/feed$/,
  /^\/v1\/models(?:\/[^/]+)?$/,
];

const FULL_PROFILE_ALLOWED_WRITE_PATHS = [
  /^\/v1\/(?:chat\/completions|messages)$/,
  /^\/api\/conversations(?:\/[^/]+(?:\/(?:messages(?:\/stream)?|greeting))?)?$/,
  /^\/api\/companion\/stage$/,
  /^\/api\/avatar\/(?:vrm|background)$/,
];

function matches(pathname: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(pathname));
}

export function shouldStartOptionalRuntimeSubsystems(
  env: AliceProductionGuardEnv = process.env,
): boolean {
  return !isAliceResponseOnlyRuntime(env);
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

  if (isAliceFullRuntimeProfile(env)) {
    if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
      return matches(pathname, FULL_PROFILE_ALLOWED_READ_PATHS)
        ? { allowed: true }
        : { allowed: false, code: "ALICE_PRODUCTION_MUTATION_DENIED" };
    }
    return matches(pathname, FULL_PROFILE_ALLOWED_WRITE_PATHS)
      ? { allowed: true }
      : { allowed: false, code: "ALICE_PRODUCTION_MUTATION_DENIED" };
  }

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
