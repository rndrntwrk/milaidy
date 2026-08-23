const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      decodeBase64Url(value),
    );
    const parsed: unknown = JSON.parse(decoded);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function fixedDigestEqual(actual: string, expected: string): boolean {
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  const subtleWithTimingSafeEqual = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBufferView, right: ArrayBufferView) => boolean;
  };
  if (
    actualBytes.byteLength === expectedBytes.byteLength &&
    typeof subtleWithTimingSafeEqual.timingSafeEqual === "function"
  ) {
    return subtleWithTimingSafeEqual.timingSafeEqual(actualBytes, expectedBytes);
  }
  const width = Math.max(actualBytes.byteLength, expectedBytes.byteLength);
  let mismatch = actualBytes.byteLength ^ expectedBytes.byteLength;
  for (let index = 0; index < width; index += 1) {
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return mismatch === 0;
}

type AccessConfig = {
  issuer: string;
  audience: string;
  ownerEmailSha256: string;
};

type AccessServiceConfig = {
  issuer: string;
  audience: string;
  serviceClientIdSha256: string;
};

type AccessIdentity = {
  subject: string;
  emailSha256: string;
  issuer: string;
  audience: string;
};

type JsonWebKeySet = { keys: JsonWebKey[] };

async function verifyAccessToken(
  token: string,
  config: Pick<AccessConfig, "issuer" | "audience">,
  loadJwks: () => Promise<JsonWebKeySet>,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; code: string }
> {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return { ok: false, code: "ACCESS_TOKEN_MALFORMED" };
  }
  const encodedHeader = segments[0]!;
  const encodedPayload = segments[1]!;
  const encodedSignature = segments[2]!;
  const header = parseJsonObject(encodedHeader);
  const claims = parseJsonObject(encodedPayload);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") {
    return { ok: false, code: "ACCESS_TOKEN_MALFORMED" };
  }

  let jwks: JsonWebKeySet;
  try {
    jwks = await loadJwks();
  } catch {
    return { ok: false, code: "ACCESS_JWKS_UNAVAILABLE" };
  }
  if (!jwks || !Array.isArray(jwks.keys)) {
    return { ok: false, code: "ACCESS_JWKS_INVALID" };
  }
  const keyId = header.kid;
  const jwk = jwks.keys.find(
    (candidate) => (candidate as JsonWebKey & { kid?: string }).kid === keyId && candidate.kty === "RSA",
  );
  if (!jwk) return { ok: false, code: "ACCESS_KEY_NOT_FOUND" };

  let verified = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return { ok: false, code: "ACCESS_SIGNATURE_INVALID" };
  }
  if (!verified) return { ok: false, code: "ACCESS_SIGNATURE_INVALID" };

  const audience = claims.aud;
  const audienceMatches =
    audience === config.audience ||
    (Array.isArray(audience) && audience.some((value) => value === config.audience));
  if (claims.iss !== config.issuer || !audienceMatches) {
    return { ok: false, code: "ACCESS_CLAIMS_MISMATCH" };
  }
  if (
    typeof claims.exp !== "number" ||
    claims.exp <= nowSeconds ||
    (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 30) ||
    (typeof claims.iat === "number" && claims.iat > nowSeconds + 30)
  ) {
    return { ok: false, code: "ACCESS_TOKEN_EXPIRED_OR_NOT_YET_VALID" };
  }
  return { ok: true, claims };
}

export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  loadJwks: () => Promise<JsonWebKeySet>,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; identity: AccessIdentity } | { ok: false; code: string }> {
  const verified = await verifyAccessToken(token, config, loadJwks, nowSeconds);
  if (!verified.ok) return verified;
  const claims = verified.claims;
  if (
    typeof claims.sub !== "string" ||
    claims.sub.trim().length === 0 ||
    typeof claims.email !== "string"
  ) {
    return { ok: false, code: "ACCESS_IDENTITY_MISSING" };
  }
  const emailSha256 = await sha256Base64Url(claims.email.trim().toLowerCase());
  if (!fixedDigestEqual(emailSha256, config.ownerEmailSha256)) {
    return { ok: false, code: "ACCESS_OWNER_MISMATCH" };
  }

  return {
    ok: true,
    identity: {
      subject: claims.sub,
      emailSha256,
      issuer: config.issuer,
      audience: config.audience,
    },
  };
}

export async function verifyAccessServiceJwt(
  token: string,
  config: AccessServiceConfig,
  loadJwks: () => Promise<JsonWebKeySet>,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<
  | {
      ok: true;
      identity: {
        commonNameSha256: string;
        issuer: string;
        audience: string;
      };
    }
  | { ok: false; code: string }
> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(config.serviceClientIdSha256)) {
    return { ok: false, code: "ACCESS_SERVICE_CONFIG_INVALID" };
  }
  const verified = await verifyAccessToken(token, config, loadJwks, nowSeconds);
  if (!verified.ok) return verified;
  const claims = verified.claims;
  if (
    claims.type !== "app" ||
    claims.sub !== "" ||
    typeof claims.common_name !== "string" ||
    !/^[A-Za-z0-9._-]{8,256}$/.test(claims.common_name)
  ) {
    return { ok: false, code: "ACCESS_SERVICE_IDENTITY_MISMATCH" };
  }
  const commonNameSha256 = await sha256Base64Url(claims.common_name);
  if (!fixedDigestEqual(commonNameSha256, config.serviceClientIdSha256)) {
    return { ok: false, code: "ACCESS_SERVICE_IDENTITY_MISMATCH" };
  }
  return {
    ok: true,
    identity: {
      commonNameSha256,
      issuer: config.issuer,
      audience: config.audience,
    },
  };
}
