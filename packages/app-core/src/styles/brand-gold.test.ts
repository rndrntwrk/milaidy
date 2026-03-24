import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("brand-gold onboarding styles", () => {
  it("pins onboarding to the viewport and prevents page scroll", () => {
    const css = readFileSync(
      new URL("./brand-gold.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain(".onboarding-screen {");
    expect(css).toContain("height: 100dvh;");
    expect(css).toContain("overflow: hidden;");
  });

  it("forces dark onboarding panel variables inside the onboarding screen", () => {
    const css = readFileSync(
      new URL("./brand-gold.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("--onboarding-panel-bg: rgba(14, 14, 18, 0.72);");
    expect(css).toContain(
      "--onboarding-text-primary: rgba(232, 230, 240, 0.92);",
    );
  });
});
