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
    ).toBe(true);
  });

  it("accepts JWT assertion headers when email forwarding is unavailable", () => {
    expect(
      isCloudflareAccessAuthenticated(
        {
          headers: {
            "cf-access-jwt-assertion": "signed.jwt.value",
          },
        },
        { ELIZA_TRUST_CLOUDFLARE_ACCESS: "true" },
      ),
    ).toBe(true);
  });
});
