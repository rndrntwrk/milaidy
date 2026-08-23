import { describe, expect, test } from "bun:test";

import {
  sha256Base64Url,
  verifyAccessJwt,
  verifyAccessServiceJwt,
} from "../src/access";

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(value).toString("base64url");
}

async function signedJwt(
  claims: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const header = {
    alg: "RS256",
    kid: "access-test-key",
    typ: "JWT",
    ...headerOverrides,
  };
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    encoder.encode(signingInput),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${signingInput}.${base64Url(signature)}`,
    jwks: { keys: [{ ...publicJwk, kid: header.kid, alg: "RS256", use: "sig" }] },
  };
}

describe("Cloudflare Access owner verification", () => {
  test("accepts only the exact service-token client on the release-controller audience", async () => {
    const now = 1_787_400_000;
    const serviceClientId = "deployment-controller-client.access";
    const serviceClientIdSha256 = await sha256Base64Url(serviceClientId);
    const { token, jwks } = await signedJwt({
      type: "app",
      iss: "https://rndrntwrk.cloudflareaccess.com",
      aud: ["alice-release-controller-audience"],
      sub: "",
      common_name: serviceClientId,
      iat: now - 10,
      exp: now + 60,
    });
    await expect(
      verifyAccessServiceJwt(
        token,
        {
          issuer: "https://rndrntwrk.cloudflareaccess.com",
          audience: "alice-release-controller-audience",
          serviceClientIdSha256,
        },
        async () => jwks,
        now,
      ),
    ).resolves.toEqual({
      ok: true,
      identity: {
        commonNameSha256: serviceClientIdSha256,
        issuer: "https://rndrntwrk.cloudflareaccess.com",
        audience: "alice-release-controller-audience",
      },
    });

    for (const claims of [
      {
        type: "app",
        iss: "https://rndrntwrk.cloudflareaccess.com",
        aud: ["alice-release-controller-audience"],
        sub: "",
        common_name: "other-controller.access",
        iat: now - 10,
        exp: now + 60,
      },
      {
        type: "app",
        iss: "https://rndrntwrk.cloudflareaccess.com",
        aud: ["alice-release-controller-audience"],
        sub: "not-a-service-token",
        common_name: serviceClientId,
        iat: now - 10,
        exp: now + 60,
      },
      {
        type: "org",
        iss: "https://rndrntwrk.cloudflareaccess.com",
        aud: ["alice-release-controller-audience"],
        sub: "",
        common_name: serviceClientId,
        iat: now - 10,
        exp: now + 60,
      },
    ]) {
      const candidate = await signedJwt(claims);
      await expect(
        verifyAccessServiceJwt(
          candidate.token,
          {
            issuer: "https://rndrntwrk.cloudflareaccess.com",
            audience: "alice-release-controller-audience",
            serviceClientIdSha256,
          },
          async () => candidate.jwks,
          now,
        ),
      ).resolves.toEqual({ ok: false, code: "ACCESS_SERVICE_IDENTITY_MISMATCH" });
    }
  });

  test("accepts a signed, unexpired JWT for the exact Access audience and owner", async () => {
    const now = 1_787_400_000;
    const ownerEmail = "owner@example.test";
    const ownerEmailSha256 = await sha256Base64Url(ownerEmail.toLowerCase());
    const { token, jwks } = await signedJwt({
      iss: "https://rndrntwrk.cloudflareaccess.com",
      aud: ["alice-access-audience"],
      sub: "access-user-id",
      email: ownerEmail,
      iat: now - 10,
      nbf: now - 10,
      exp: now + 60,
    });

    await expect(
      verifyAccessJwt(
        token,
        {
          issuer: "https://rndrntwrk.cloudflareaccess.com",
          audience: "alice-access-audience",
          ownerEmailSha256,
        },
        async () => jwks,
        now,
      ),
    ).resolves.toEqual({
      ok: true,
      identity: {
        subject: "access-user-id",
        emailSha256: ownerEmailSha256,
        issuer: "https://rndrntwrk.cloudflareaccess.com",
        audience: "alice-access-audience",
      },
    });
  });

  test("fails closed for a bad signature, issuer, audience, owner, or time window", async () => {
    const now = 1_787_400_000;
    const ownerEmail = "owner@example.test";
    const config = {
      issuer: "https://rndrntwrk.cloudflareaccess.com",
      audience: "alice-access-audience",
      ownerEmailSha256: await sha256Base64Url(ownerEmail),
    };
    const baseClaims = {
      iss: config.issuer,
      aud: config.audience,
      sub: "access-user-id",
      email: ownerEmail,
      iat: now - 10,
      nbf: now - 10,
      exp: now + 60,
    };

    const valid = await signedJwt(baseClaims);
    const [validHeader, validPayload, validSignature] = valid.token.split(".");
    const tamperedSignature = `${validSignature.startsWith("A") ? "B" : "A"}${validSignature.slice(1)}`;
    const tampered = `${validHeader}.${validPayload}.${tamperedSignature}`;
    await expect(
      verifyAccessJwt(tampered, config, async () => valid.jwks, now),
    ).resolves.toEqual({ ok: false, code: "ACCESS_SIGNATURE_INVALID" });

    for (const [claims, code] of [
      [{ ...baseClaims, iss: "https://other.cloudflareaccess.com" }, "ACCESS_CLAIMS_MISMATCH"],
      [{ ...baseClaims, aud: "other-audience" }, "ACCESS_CLAIMS_MISMATCH"],
      [{ ...baseClaims, email: "not-owner@example.test" }, "ACCESS_OWNER_MISMATCH"],
      [{ ...baseClaims, exp: now }, "ACCESS_TOKEN_EXPIRED_OR_NOT_YET_VALID"],
      [{ ...baseClaims, nbf: now + 31 }, "ACCESS_TOKEN_EXPIRED_OR_NOT_YET_VALID"],
      [{ ...baseClaims, iat: now + 31 }, "ACCESS_TOKEN_EXPIRED_OR_NOT_YET_VALID"],
    ] as const) {
      const candidate = await signedJwt(claims);
      await expect(
        verifyAccessJwt(candidate.token, config, async () => candidate.jwks, now),
      ).resolves.toEqual({ ok: false, code });
    }
  });

  test("fails closed when key discovery is unavailable, invalid, or missing the signing key", async () => {
    const now = 1_787_400_000;
    const ownerEmail = "owner@example.test";
    const ownerEmailSha256 = await sha256Base64Url(ownerEmail);
    const { token } = await signedJwt({
      iss: "https://rndrntwrk.cloudflareaccess.com",
      aud: "alice-access-audience",
      sub: "access-user-id",
      email: ownerEmail,
      iat: now - 10,
      exp: now + 60,
    });
    const config = {
      issuer: "https://rndrntwrk.cloudflareaccess.com",
      audience: "alice-access-audience",
      ownerEmailSha256,
    };

    await expect(
      verifyAccessJwt(token, config, async () => {
        throw new Error("offline");
      }, now),
    ).resolves.toEqual({ ok: false, code: "ACCESS_JWKS_UNAVAILABLE" });
    await expect(
      verifyAccessJwt(token, config, async () => ({ keys: null }) as never, now),
    ).resolves.toEqual({ ok: false, code: "ACCESS_JWKS_INVALID" });
    await expect(
      verifyAccessJwt(token, config, async () => ({ keys: [] }), now),
    ).resolves.toEqual({ ok: false, code: "ACCESS_KEY_NOT_FOUND" });
  });

  test("rejects malformed tokens and unsupported algorithms before key lookup", async () => {
    const config = {
      issuer: "https://rndrntwrk.cloudflareaccess.com",
      audience: "alice-access-audience",
      ownerEmailSha256: await sha256Base64Url("owner@example.test"),
    };
    let keyLoads = 0;
    const loadJwks = async () => {
      keyLoads += 1;
      return { keys: [] };
    };

    await expect(verifyAccessJwt("not-a-jwt", config, loadJwks)).resolves.toEqual({
      ok: false,
      code: "ACCESS_TOKEN_MALFORMED",
    });
    const unsupported = await signedJwt(
      { exp: 1_787_400_060 },
      { alg: "HS256" },
    );
    await expect(
      verifyAccessJwt(unsupported.token, config, loadJwks, 1_787_400_000),
    ).resolves.toEqual({ ok: false, code: "ACCESS_TOKEN_MALFORMED" });
    expect(keyLoads).toBe(0);
  });
});
