import { describe, expect, it } from "vitest";
import { classifyIntent } from "./life";

describe("classifyIntent email localization", () => {
  it("routes spanish email queries to query_email", () => {
    expect(classifyIntent("revisa mi correo")).toBe("query_email");
    expect(classifyIntent("tengo correos importantes?")).toBe("query_email");
  });
});
