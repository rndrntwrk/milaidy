import { afterEach, describe, expect, it, vi } from "vitest";
import { CompensationRegistry } from "./compensation-registry.js";
import { registerBuiltinCompensations } from "./compensations/index.js";
import type { CompensationContext } from "./types.js";

function makeCtx(
  overrides: Partial<CompensationContext> = {},
): CompensationContext {
  return {
    toolName: "GENERATE_IMAGE",
    params: { prompt: "a cat" },
    result: { outputPath: "/tmp/cat.png" },
    requestId: "req-1",
    ...overrides,
  };
}

describe("CompensationRegistry", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("register() / has()", () => {
    it("registers and checks for a compensation function", () => {
      const registry = new CompensationRegistry();
      expect(registry.has("MY_TOOL")).toBe(false);
      registry.register("MY_TOOL", async () => ({ success: true }));
      expect(registry.has("MY_TOOL")).toBe(true);
    });
  });

  describe("compensate()", () => {
    it("calls the registered compensation function", async () => {
      const registry = new CompensationRegistry();
      const fn = vi.fn().mockResolvedValue({ success: true, detail: "done" });
      registry.register("MY_TOOL", fn);

      const ctx = makeCtx({ toolName: "MY_TOOL" });
      const result = await registry.compensate(ctx);

      expect(fn).toHaveBeenCalledWith(ctx);
      expect(result.success).toBe(true);
      expect(result.detail).toBe("done");
    });

    it("returns failure for unregistered tool", async () => {
      const registry = new CompensationRegistry();
      const result = await registry.compensate(
        makeCtx({ toolName: "UNKNOWN" }),
      );

      expect(result.success).toBe(false);
      expect(result.detail).toContain("No compensation registered");
      expect(result.detail).toContain("UNKNOWN");
    });

    it("catches errors from compensation function gracefully", async () => {
      const registry = new CompensationRegistry();
      registry.register("BAD_TOOL", async () => {
        throw new Error("compensation boom");
      });

      const result = await registry.compensate(
        makeCtx({ toolName: "BAD_TOOL" }),
      );

      expect(result.success).toBe(false);
      expect(result.detail).toContain("compensation boom");
    });

    it("handles non-Error throws gracefully", async () => {
      const registry = new CompensationRegistry();
      registry.register("BAD_TOOL", async () => {
        throw "string error";
      });

      const result = await registry.compensate(
        makeCtx({ toolName: "BAD_TOOL" }),
      );

      expect(result.success).toBe(false);
      expect(result.detail).toContain("string error");
    });
  });

  describe("registerBuiltinCompensations()", () => {
    it("registers compensations for all 3 media tools", () => {
      const registry = new CompensationRegistry();
      registerBuiltinCompensations(registry);

      expect(registry.has("GENERATE_IMAGE")).toBe(true);
      expect(registry.has("GENERATE_VIDEO")).toBe(true);
      expect(registry.has("GENERATE_AUDIO")).toBe(true);
    });

    it("media compensations return success with detail", async () => {
      const registry = new CompensationRegistry();
      registerBuiltinCompensations(registry);

      const result = await registry.compensate(
        makeCtx({
          toolName: "GENERATE_IMAGE",
          result: { outputPath: "/tmp/image.png" },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.detail).toContain("image");
      expect(result.detail).toContain("/tmp/image.png");
    });

    it("media compensation works without outputPath in result", async () => {
      const registry = new CompensationRegistry();
      registerBuiltinCompensations(registry);

      const result = await registry.compensate(
        makeCtx({
          toolName: "GENERATE_VIDEO",
          result: undefined,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.detail).toContain("video");
    });
  });
});
