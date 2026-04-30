import { describe, expect, it } from "vitest";
import {
  builtinInvariantCatalog,
  builtinInvariants,
} from "./builtin-invariants.js";

describe("builtin invariants", () => {
  it("all built-in invariants define severity and owner", () => {
    expect(
      builtinInvariants.every(
        (invariant) =>
          invariant.severity.length > 0 &&
          typeof invariant.owner === "string" &&
          invariant.owner.length > 0,
      ),
    ).toBe(true);
  });

  it("catalog mirrors built-in invariant metadata", () => {
    const idsFromInvariants = builtinInvariants.map((invariant) => invariant.id);
    const idsFromCatalog = builtinInvariantCatalog.map((entry) => entry.id);

    expect(idsFromCatalog).toEqual(idsFromInvariants);
    expect(
      builtinInvariantCatalog.every(
        (entry) =>
          entry.description.length > 0 &&
          entry.severity.length > 0 &&
          entry.owner.length > 0,
      ),
    ).toBe(true);
  });
});
