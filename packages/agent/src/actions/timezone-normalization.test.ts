import { describe, expect, it } from "vitest";
import {
  extractExplicitTimeZoneFromText,
  normalizeExplicitTimeZoneToken,
} from "./timezone-normalization";

describe("timezone-normalization", () => {
  it("normalizes short aliases and multi-word timezone phrases", () => {
    expect(normalizeExplicitTimeZoneToken("pst")).toBe(
      "America/Los_Angeles",
    );
    expect(normalizeExplicitTimeZoneToken("mountain time")).toBe(
      "America/Denver",
    );
    expect(normalizeExplicitTimeZoneToken("eastern timezone")).toBe(
      "America/New_York",
    );
  });

  it("extracts explicit timezones from natural-language phrases", () => {
    expect(
      extractExplicitTimeZoneFromText(
        "set a reminder for 8pm mountain time to call mom",
      ),
    ).toBe("America/Denver");
    expect(
      extractExplicitTimeZoneFromText(
        "schedule it for 7 pm pacific time on friday",
      ),
    ).toBe("America/Los_Angeles");
    expect(
      extractExplicitTimeZoneFromText(
        "move it to 9am New York time next Tuesday",
      ),
    ).toBe("America/New_York");
  });

  it("prefers explicit IANA zones when present", () => {
    expect(
      extractExplicitTimeZoneFromText(
        "set it for 08:00 in America/Chicago tomorrow",
      ),
    ).toBe("America/Chicago");
  });
});
