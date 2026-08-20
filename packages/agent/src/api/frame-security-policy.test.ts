import { describe, expect, it } from "vitest";
import { resolveFrameSecurityPolicy } from "./frame-security-policy";

describe("resolveFrameSecurityPolicy", () => {
  it("allows only the production Stream origin to frame the Alice broadcast shell", () => {
    expect(resolveFrameSecurityPolicy("/broadcast/alice-cam")).toEqual({
      xFrameOptions: null,
      contentSecurityPolicy:
        "frame-ancestors 'self' https://stream.rndrntwrk.com",
    });
    expect(resolveFrameSecurityPolicy("/broadcast/alice-cam/")).toEqual({
      xFrameOptions: null,
      contentSecurityPolicy:
        "frame-ancestors 'self' https://stream.rndrntwrk.com",
    });
  });

  it("keeps clickjacking denial on every other route", () => {
    expect(resolveFrameSecurityPolicy("/")).toEqual({
      xFrameOptions: "DENY",
      contentSecurityPolicy: null,
    });
    expect(resolveFrameSecurityPolicy("/broadcast/not-allowed")).toEqual({
      xFrameOptions: "DENY",
      contentSecurityPolicy: null,
    });
    expect(resolveFrameSecurityPolicy("/api/broadcast/alice-cam/scene")).toEqual({
      xFrameOptions: "DENY",
      contentSecurityPolicy: null,
    });
  });
});
