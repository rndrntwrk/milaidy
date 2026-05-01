import { describe, expect, it } from "vitest";
import {
  hasCloudflareAccessIdentity,
  isCloudflareAccessAuthenticated,
  isCloudflareAccessTrustEnabled,
} from "./cloudflare-access-auth";

describe("Cloudflare Access auth trust gate", () => {
  it("requires explicit trust before accepting Cloudflare Access identity headers", () => {
    const req = {
      headers: {
        "cf-access-authenticated-user-email": "gl4sspr1sm@gmail.com",
      },
    };

    expect(hasCloudflareAccessIdentity(req)).toBe(true);
    expect(isCloudflareAccessTrustEnabled({})).toBe(false);
    expect(isCloudflareAccessAuthenticated(req, {})).toBe(false);
    expect(
      isCloudflareAccessAuthenticated(req, {
        MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
      }),
    ).toBe(false);
    expect(
      isCloudflareAccessAuthenticated(
        {
          headers: {
            ...req.headers,
            "x-milady-cloudflare-access-secret": "origin-proof",
          },
        },
        {
          MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
          MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET: "origin-proof",
        },
      ),
    ).toBe(true);
  });

  it("rejects Cloudflare Access identity headers with the wrong origin proof", () => {
    expect(
      isCloudflareAccessAuthenticated(
        {
          headers: {
            "cf-access-authenticated-user-email": "gl4sspr1sm@gmail.com",
            "x-milady-cloudflare-access-secret": "wrong-proof",
          },
        },
        {
          MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
          MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET: "origin-proof",
        },
      ),
    ).toBe(false);
  });

  it("accepts JWT assertion headers when email forwarding is unavailable", () => {
    expect(
      isCloudflareAccessAuthenticated(
        {
          headers: {
            "cf-access-jwt-assertion": "signed.jwt.value",
            "x-milady-cloudflare-access-secret": "origin-proof",
          },
        },
        {
          ELIZA_TRUST_CLOUDFLARE_ACCESS: "true",
          CLOUDFLARE_ACCESS_PROXY_SECRET: "origin-proof",
        },
      ),
    ).toBe(true);
  });
});
