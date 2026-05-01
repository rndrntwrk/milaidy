import type http from "node:http";
import crypto from "node:crypto";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function envFlagEnabled(value: string | undefined): boolean {
  return value ? ENABLED_VALUES.has(value.trim().toLowerCase()) : false;
}

function readHeader(
  req: Pick<http.IncomingMessage, "headers">,
  name: string,
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.find((item) => item.trim().length > 0);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function isCloudflareAccessTrustEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    envFlagEnabled(env.MILADY_TRUST_CLOUDFLARE_ACCESS) ||
    envFlagEnabled(env.MILAIDY_TRUST_CLOUDFLARE_ACCESS) ||
    envFlagEnabled(env.ELIZA_TRUST_CLOUDFLARE_ACCESS) ||
    envFlagEnabled(env.CLOUDFLARE_ACCESS_TRUSTED)
  );
}

function readTrustedProxySecret(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET ??
    env.MILAIDY_CLOUDFLARE_ACCESS_PROXY_SECRET ??
    env.ELIZA_CLOUDFLARE_ACCESS_PROXY_SECRET ??
    env.CLOUDFLARE_ACCESS_PROXY_SECRET
  )?.trim();
}

function tokenMatches(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function hasCloudflareAccessIdentity(
  req: Pick<http.IncomingMessage, "headers">,
): boolean {
  return Boolean(
    readHeader(req, "cf-access-authenticated-user-email") ||
      readHeader(req, "cf-access-jwt-assertion"),
  );
}

export function hasCloudflareAccessTrustedProxyProof(
  req: Pick<http.IncomingMessage, "headers">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expectedSecret = readTrustedProxySecret(env);
  if (!expectedSecret) return false;
  const providedSecret =
    readHeader(req, "x-milady-cloudflare-access-secret") ??
    readHeader(req, "x-eliza-cloudflare-access-secret") ??
    readHeader(req, "x-cloudflare-access-proxy-secret");
  return providedSecret
    ? tokenMatches(expectedSecret, providedSecret)
    : false;
}

export function isCloudflareAccessAuthenticated(
  req: Pick<http.IncomingMessage, "headers">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isCloudflareAccessTrustEnabled(env) &&
    hasCloudflareAccessIdentity(req) &&
    hasCloudflareAccessTrustedProxyProof(req, env)
  );
}
