import type http from "node:http";

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

export function hasCloudflareAccessIdentity(
  req: Pick<http.IncomingMessage, "headers">,
): boolean {
  return Boolean(
    readHeader(req, "cf-access-authenticated-user-email") ||
      readHeader(req, "cf-access-jwt-assertion"),
  );
}

export function isCloudflareAccessAuthenticated(
  req: Pick<http.IncomingMessage, "headers">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isCloudflareAccessTrustEnabled(env) && hasCloudflareAccessIdentity(req);
}
