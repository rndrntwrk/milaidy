import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, setToken, clearToken, isTokenExpired, extractTokenFromUrl } from "../lib/auth";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("auth", () => {
  it("stores and retrieves token", () => {
    setToken("test-token-abc");
    expect(getToken()).toBe("test-token-abc");
  });

  it("clears token", () => {
    setToken("test-token-abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("detects expired JWT", () => {
    const expiredJwt = btoa(JSON.stringify({ alg: "HS256" })) + "." +
      btoa(JSON.stringify({ exp: 1000 })) + ".sig";
    expect(isTokenExpired(expiredJwt)).toBe(true);
  });

  it("detects valid JWT", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const validJwt = btoa(JSON.stringify({ alg: "HS256" })) + "." +
      btoa(JSON.stringify({ exp: futureExp })) + ".sig";
    expect(isTokenExpired(validJwt)).toBe(false);
  });

  it("extracts token from URL search params", () => {
    const token = extractTokenFromUrl("?token=abc123&other=val");
    expect(token).toBe("abc123");
  });

  it("returns null when no token in URL", () => {
    expect(extractTokenFromUrl("?other=val")).toBeNull();
  });
});
