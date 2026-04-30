/**
 * Tests for di/container.ts
 *
 * Exercises:
 *   - Service registration and resolution
 *   - Singleton vs transient scopes
 *   - Child containers (scopes)
 *   - Container disposal
 *   - Type-safe tokens
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContainerBuilder,
  createToken,
  getContainer,
  resetContainer,
  ServiceContainer,
  setContainer,
  type ServiceToken,
} from "./container.js";

// Test service interfaces
interface TestService {
  name: string;
  getValue(): number;
}

interface DependentService {
  getTestValue(): number;
}

// Test tokens
const TEST_TOKEN = createToken<TestService>("TestService");
const DEPENDENT_TOKEN = createToken<DependentService>("DependentService");
const VALUE_TOKEN = createToken<string>("ValueService");

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  afterEach(async () => {
    await container.dispose();
  });

  describe("register and get", () => {
    it("registers and resolves a service", () => {
      container.register(TEST_TOKEN, () => ({
        name: "test",
        getValue: () => 42,
      }));

      const service = container.get(TEST_TOKEN);
      expect(service.name).toBe("test");
      expect(service.getValue()).toBe(42);
    });

    it("throws when service not registered", () => {
      expect(() => container.get(TEST_TOKEN)).toThrow("Service not registered");
    });

    it("tryGet returns undefined when not registered", () => {
      expect(container.tryGet(TEST_TOKEN)).toBeUndefined();
    });
  });

  describe("registerValue", () => {
    it("registers a constant value", () => {
      container.registerValue(VALUE_TOKEN, "hello");
      expect(container.get(VALUE_TOKEN)).toBe("hello");
    });

    it("always returns the same instance", () => {
      const obj = { data: "test" };
      const token = createToken<typeof obj>("obj");
      container.registerValue(token, obj);

      expect(container.get(token)).toBe(obj);
      expect(container.get(token)).toBe(obj);
    });
  });

  describe("singleton scope", () => {
    it("returns same instance on multiple gets", () => {
      let callCount = 0;
      container.register(
        TEST_TOKEN,
        () => {
          callCount++;
          return { name: `instance-${callCount}`, getValue: () => callCount };
        },
        "singleton",
      );

      const first = container.get(TEST_TOKEN);
      const second = container.get(TEST_TOKEN);

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });
  });

  describe("transient scope", () => {
    it("creates new instance on each get", () => {
      let callCount = 0;
      container.register(
        TEST_TOKEN,
        () => {
          callCount++;
          return { name: `instance-${callCount}`, getValue: () => callCount };
        },
        "transient",
      );

      const first = container.get(TEST_TOKEN);
      const second = container.get(TEST_TOKEN);

      expect(first).not.toBe(second);
      expect(first.name).toBe("instance-1");
      expect(second.name).toBe("instance-2");
      expect(callCount).toBe(2);
    });
  });

  describe("dependency injection", () => {
    it("resolves dependencies from container", () => {
      container.register(TEST_TOKEN, () => ({
        name: "test",
        getValue: () => 100,
      }));

      container.register(DEPENDENT_TOKEN, (c) => ({
        getTestValue: () => c.get(TEST_TOKEN).getValue() * 2,
      }));

      const dependent = container.get(DEPENDENT_TOKEN);
      expect(dependent.getTestValue()).toBe(200);
    });
  });

  describe("has", () => {
    it("returns true for registered services", () => {
      container.register(TEST_TOKEN, () => ({ name: "test", getValue: () => 1 }));
      expect(container.has(TEST_TOKEN)).toBe(true);
    });

    it("returns false for unregistered services", () => {
      expect(container.has(TEST_TOKEN)).toBe(false);
    });
  });

  describe("child containers (scopes)", () => {
    it("creates child container that inherits from parent", () => {
      container.register(TEST_TOKEN, () => ({ name: "parent", getValue: () => 1 }));

      const child = container.createScope();

      expect(child.get(TEST_TOKEN).name).toBe("parent");
    });

    it("child can override parent registrations", () => {
      container.register(TEST_TOKEN, () => ({ name: "parent", getValue: () => 1 }));

      const child = container.createScope();
      child.register(TEST_TOKEN, () => ({ name: "child", getValue: () => 2 }));

      expect(child.get(TEST_TOKEN).name).toBe("child");
      expect(container.get(TEST_TOKEN).name).toBe("parent");
    });

    it("child checks parent when service not found locally", () => {
      container.register(TEST_TOKEN, () => ({ name: "parent", getValue: () => 1 }));
      container.registerValue(VALUE_TOKEN, "parent-value");

      const child = container.createScope();
      child.register(TEST_TOKEN, () => ({ name: "child", getValue: () => 2 }));

      // TEST_TOKEN overridden, VALUE_TOKEN inherited
      expect(child.get(TEST_TOKEN).name).toBe("child");
      expect(child.get(VALUE_TOKEN)).toBe("parent-value");
    });
  });

  describe("dispose", () => {
    it("calls dispose on singleton instances", async () => {
      const dispose = vi.fn();
      const token = createToken<{ dispose: () => Promise<void> }>("disposable");

      container.register(token, () => ({ dispose }));
      container.get(token); // Create instance

      await container.dispose();

      expect(dispose).toHaveBeenCalled();
    });

    it("throws on operations after dispose", async () => {
      await container.dispose();

      expect(() => container.get(TEST_TOKEN)).toThrow("disposed");
      expect(() => container.register(TEST_TOKEN, () => ({ name: "", getValue: () => 0 }))).toThrow(
        "disposed",
      );
    });
  });

  describe("getRegisteredTokens", () => {
    it("returns all registered tokens", () => {
      container.register(TEST_TOKEN, () => ({ name: "", getValue: () => 0 }));
      container.registerValue(VALUE_TOKEN, "test");

      const tokens = container.getRegisteredTokens();
      expect(tokens).toContain(TEST_TOKEN);
      expect(tokens).toContain(VALUE_TOKEN);
    });

    it("includes parent tokens for child containers", () => {
      container.register(TEST_TOKEN, () => ({ name: "", getValue: () => 0 }));

      const child = container.createScope();
      child.registerValue(VALUE_TOKEN, "child");

      const tokens = child.getRegisteredTokens();
      expect(tokens).toContain(TEST_TOKEN);
      expect(tokens).toContain(VALUE_TOKEN);
    });
  });
});

describe("ContainerBuilder", () => {
  it("builds container with all registrations", () => {
    const container = new ContainerBuilder()
      .addService(TEST_TOKEN, () => ({ name: "built", getValue: () => 99 }))
      .addValue(VALUE_TOKEN, "builder-value")
      .build();

    expect(container.get(TEST_TOKEN).name).toBe("built");
    expect(container.get(VALUE_TOKEN)).toBe("builder-value");
  });
});

describe("global container", () => {
  afterEach(async () => {
    await resetContainer();
  });

  it("getContainer returns singleton", () => {
    const c1 = getContainer();
    const c2 = getContainer();
    expect(c1).toBe(c2);
  });

  it("setContainer replaces global container", () => {
    const custom = new ServiceContainer();
    custom.registerValue(VALUE_TOKEN, "custom");

    setContainer(custom);

    expect(getContainer().get(VALUE_TOKEN)).toBe("custom");
  });

  it("resetContainer disposes and clears global", async () => {
    const c1 = getContainer();
    await resetContainer();
    const c2 = getContainer();

    expect(c1).not.toBe(c2);
  });
});

describe("createToken", () => {
  it("creates unique symbols", () => {
    const token1 = createToken("Test");
    const token2 = createToken("Test");

    // Symbol.for returns same symbol for same key
    expect(token1).toBe(token2);
  });

  it("different names create different tokens", () => {
    const token1 = createToken("Service1");
    const token2 = createToken("Service2");

    expect(token1).not.toBe(token2);
  });
});
