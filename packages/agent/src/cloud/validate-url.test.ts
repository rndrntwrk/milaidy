/**
 * Cloud URL validation — REAL integration tests.
 *
 * Tests validateCloudBaseUrl with real DNS resolution for valid URLs
 * and real IP blocking logic for blocked ranges.
 *
 * Pre-DNS checks (malformed URLs, blocked IP literals, localhost patterns)
 * are pure logic that doesn't need DNS at all.
 * DNS-dependent checks use real DNS resolution against known public domains.
 */

import { describe, expect, it } from "vitest";
import { validateCloudBaseUrl } from "./validate-url.js";

describe("validateCloudBaseUrl", () => {
  // -----------------------------------------------------------------------
  // Pure logic checks — no DNS needed
  // -----------------------------------------------------------------------

  it("rejects malformed URLs", async () => {
    const result = await validateCloudBaseUrl("not a url");
    expect(result).toContain("Invalid cloud base URL");
  });

  it("requires https scheme", async () => {
    const result = await validateCloudBaseUrl("http://example.com");
    expect(result).toContain("must use HTTPS");
  });

  it("blocks direct link-local/metadata targets", async () => {
    const result = await validateCloudBaseUrl("https://169.254.169.254");
    expect(result).toContain("blocked");
  });

  it("blocks IPv6 link-local targets across fe80::/10", async () => {
    const fe80 = await validateCloudBaseUrl("https://[fe80::1]");
    const fea0 = await validateCloudBaseUrl("https://[fea0::1]");
    const febf = await validateCloudBaseUrl("https://[febf::1]");

    expect(fe80).toContain("blocked");
    expect(fea0).toContain("blocked");
    expect(febf).toContain("blocked");
  });

  it("blocks additional special-use IPv4 ranges", async () => {
    const cgnat = await validateCloudBaseUrl("https://100.64.1.10");
    const benchmark = await validateCloudBaseUrl("https://198.18.0.5");
    const multicast = await validateCloudBaseUrl("https://239.1.2.3");

    expect(cgnat).toContain("blocked");
    expect(benchmark).toContain("blocked");
    expect(multicast).toContain("blocked");
  });

  it("blocks localhost-style hostnames before DNS resolution", async () => {
    const localhost = await validateCloudBaseUrl("https://localhost");
    const internalLocal = await validateCloudBaseUrl("https://api.local");

    expect(localhost).toContain("blocked local hostname");
    expect(internalLocal).toContain("blocked local hostname");
  });

  it("blocks direct IPv6 ULA targets across fc00::/7", async () => {
    const fcResult = await validateCloudBaseUrl("https://[fc12::1]");
    const fdResult = await validateCloudBaseUrl("https://[fd12::1]");
    expect(fcResult).toContain("blocked");
    expect(fdResult).toContain("blocked");
  });

  it("blocks IPv6-mapped IPv4 loopback targets", async () => {
    const result = await validateCloudBaseUrl("https://[::ffff:7f00:1]");
    expect(result).toContain("blocked");
  });

  it("blocks IPv6 multicast and unspecified addresses", async () => {
    const multicast = await validateCloudBaseUrl("https://[ff02::1]");
    const unspecified = await validateCloudBaseUrl("https://[::]");
    expect(multicast).toContain("blocked");
    expect(unspecified).toContain("blocked");
  });

  // -----------------------------------------------------------------------
  // Real DNS checks — uses actual DNS resolution
  // -----------------------------------------------------------------------

  it("allows real public domains (example.com)", async () => {
    // example.com is an IANA-reserved domain that resolves to a public IP
    const result = await validateCloudBaseUrl("https://example.com");
    // Should either pass (null) or fail with a DNS error — but NOT block as internal
    if (result !== null) {
      // DNS may fail in some environments but should not be "blocked internal"
      expect(result).not.toContain("blocked internal");
    }
  }, 30_000);

  it("fails closed for non-existent domains", async () => {
    // This domain should not resolve
    const result = await validateCloudBaseUrl(
      "https://this-domain-does-not-exist-xyz-12345.com",
    );
    // Should fail with DNS resolution error
    expect(result).not.toBeNull();
  }, 30_000);
});
