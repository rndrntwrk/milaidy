import { describe, expect, it } from "vitest";
import { looksLikeRoleIntent } from "../src/intent";

describe("looksLikeRoleIntent", () => {
  it("matches Spanish role-management text", () => {
    expect(looksLikeRoleIntent("cambia el rol de alice a administrador")).toBe(
      true,
    );
  });

  it("matches Chinese role-management text", () => {
    expect(looksLikeRoleIntent("把 alice 设为管理员")).toBe(true);
  });

  it("ignores unrelated text", () => {
    expect(looksLikeRoleIntent("what's the weather in Denver")).toBe(false);
  });
});
