import { describe, expect, it } from "vitest";
import { Deidentifier, deidentifyEpisodes } from "./deidentification.js";

describe("Deidentifier", () => {
  it("redacts common sensitive identifiers in free text", () => {
    const deidentifier = new Deidentifier({ salt: "test-salt" });
    const source =
      "Contact alice@example.com or +1 (415) 555-0133. Host 10.0.0.7 token sk-abc123456789.";
    const redacted = deidentifier.deidentifyText(source);

    expect(redacted).not.toContain("alice@example.com");
    expect(redacted).not.toContain("+1 (415) 555-0133");
    expect(redacted).not.toContain("10.0.0.7");
    expect(redacted).not.toContain("sk-abc123456789");
    expect(redacted).toContain("<EMAIL_");
    expect(redacted).toContain("<PHONE_");
    expect(redacted).toContain("<IP_");
    expect(redacted).toContain("<SECRET_");
  });

  it("keeps pseudonyms stable for repeated values", () => {
    const deidentifier = new Deidentifier({ salt: "stable-salt" });
    const first = deidentifier.deidentifyText("alice@example.com");
    const second = deidentifier.deidentifyText("alice@example.com");
    expect(first).toBe(second);
  });

  it("redacts nested object values and known secret fields", () => {
    const deidentifier = new Deidentifier({ salt: "obj-salt" });
    const payload = {
      user: {
        email: "ops@example.com",
        phone: "+1 212 555 0101",
      },
      credentials: {
        apiKey: "my-real-secret-token",
      },
      notes: ["reach me at ops@example.com"],
    };

    const redacted = deidentifier.deidentifyValue(payload);
    expect(JSON.stringify(redacted)).not.toContain("ops@example.com");
    expect(JSON.stringify(redacted)).not.toContain("my-real-secret-token");
    expect(String(redacted.credentials.apiKey)).toContain("<SECRET_");
  });
});

describe("deidentifyEpisodes", () => {
  it("deidentifies episode descriptions and metadata recursively", () => {
    const episodes = [
      {
        id: "ep-1",
        description: "User email bob@example.com",
        steps: [],
        planSteps: 0,
        totalReward: { total: 0.8, breakdown: {}, dimensions: [], computedAt: 1 },
        driftScore: 0,
        auditAnomalies: ["ip 192.168.1.50"],
        durationMs: 100,
        success: true,
        completedAt: 1,
      },
    ] as Array<import("./types.js").Episode>;

    const redacted = deidentifyEpisodes(episodes, { salt: "eps" });
    expect(redacted[0].description).not.toContain("bob@example.com");
    expect(redacted[0].auditAnomalies[0]).toContain("<IP_");
  });
});
