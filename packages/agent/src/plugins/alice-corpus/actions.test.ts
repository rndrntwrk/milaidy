import { describe, expect, it } from "vitest";
import { formatGraphSearchResults } from "./actions.js";

describe("Alice corpus graph action formatting", () => {
  it("includes stable node identifiers and labels", () => {
    const formatted = formatGraphSearchResults([
      {
        node_id: "system:alice",
        node_type: "System",
        label: "Alice",
        visibility: "INTERNAL",
        properties: {},
      },
    ]);

    expect(formatted).toContain("system:alice");
    expect(formatted).toContain("Alice");
  });
});
