import { afterEach, describe, expect, it } from "vitest";
import { resolveContextWindow } from "./lifeops-extraction-config.js";

describe("resolveContextWindow", () => {
  const ENV_KEY = "MILADY_LIFEOPS_CONTEXT_WINDOW";

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("returns default (16) when env is unset", () => {
    delete process.env[ENV_KEY];
    expect(resolveContextWindow()).toBe(16);
  });

  it("returns env value when set to a valid positive integer", () => {
    process.env[ENV_KEY] = "32";
    expect(resolveContextWindow()).toBe(32);
  });

  it("returns default when env is set to zero", () => {
    process.env[ENV_KEY] = "0";
    expect(resolveContextWindow()).toBe(16);
  });

  it("returns default when env is set to a negative number", () => {
    process.env[ENV_KEY] = "-5";
    expect(resolveContextWindow()).toBe(16);
  });

  it("returns default when env is set to a non-numeric string", () => {
    process.env[ENV_KEY] = "abc";
    expect(resolveContextWindow()).toBe(16);
  });

  it("returns default when env is set to an empty string", () => {
    process.env[ENV_KEY] = "";
    expect(resolveContextWindow()).toBe(16);
  });

  it("truncates float values to integer", () => {
    process.env[ENV_KEY] = "10.7";
    expect(resolveContextWindow()).toBe(10);
  });
});
