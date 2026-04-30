/**
 * Tests for structured logger.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, withContext, getContext } from "./logger.js";

describe("createLogger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("logs info messages", () => {
    const logger = createLogger({ level: "info", pretty: false });
    logger.info("Test message");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("Test message");
    expect(parsed.time).toBeDefined();
  });

  test("respects log level", () => {
    const logger = createLogger({ level: "warn", pretty: false });

    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warn message");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain("Warn message");
  });

  test("logs error messages to stderr", () => {
    const logger = createLogger({ level: "info", pretty: false });
    logger.error("Error message");

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0][0];
    expect(output).toContain("Error message");
  });

  test("includes additional data", () => {
    const logger = createLogger({ level: "info", pretty: false });
    logger.info("Test", { foo: "bar", count: 42 });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.foo).toBe("bar");
    expect(parsed.count).toBe(42);
  });

  test("redacts sensitive data", () => {
    const logger = createLogger({ level: "info", pretty: false });
    logger.info("Test", {
      apiKey: "secret123",
      password: "hunter2",
      token: "abc",
      config: { nested: { api_key: "nested-secret" } }
    });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.config.nested.api_key).toBe("[REDACTED]");
  });

  test("allows custom redact paths", () => {
    const logger = createLogger({
      level: "info",
      pretty: false,
      redactPaths: ["customSecret"],
    });
    logger.info("Test", { customSecret: "secret", visible: "visible" });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.customSecret).toBe("[REDACTED]");
    expect(parsed.visible).toBe("visible");
  });

  test("creates child logger with bindings", () => {
    const logger = createLogger({ level: "info", pretty: false });
    const child = logger.child({ module: "test-module" });

    child.info("Child message");

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.module).toBe("test-module");
    expect(parsed.msg).toBe("Child message");
  });

  test("pretty prints in development mode", () => {
    const logger = createLogger({ level: "info", pretty: true });
    logger.info("Pretty message");

    const output = consoleSpy.mock.calls[0][0];
    // Pretty output should contain ANSI codes and not be valid JSON
    expect(() => JSON.parse(output)).toThrow();
    expect(output).toContain("Pretty message");
  });
});

describe("withContext", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("injects request context into logs", () => {
    const logger = createLogger({ level: "info", pretty: false });

    withContext({ requestId: "req-123", userId: "user-456" }, () => {
      logger.info("Contextual message");
    });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.requestId).toBe("req-123");
    expect(parsed.userId).toBe("user-456");
  });

  test("context is isolated to the callback", () => {
    const logger = createLogger({ level: "info", pretty: false });

    withContext({ requestId: "req-123" }, () => {
      // Context available here
    });

    // Context should not leak outside
    logger.info("Outside message");

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.requestId).toBeUndefined();
  });

  test("getContext returns current context", () => {
    expect(getContext()).toBeUndefined();

    withContext({ requestId: "req-123" }, () => {
      const ctx = getContext();
      expect(ctx?.requestId).toBe("req-123");
    });

    expect(getContext()).toBeUndefined();
  });

  test("nested contexts work correctly", () => {
    const logger = createLogger({ level: "info", pretty: false });

    withContext({ requestId: "outer" }, () => {
      withContext({ requestId: "inner", sessionId: "session-1" }, () => {
        logger.info("Inner message");
      });
      logger.info("Outer message");
    });

    const innerOutput = JSON.parse(consoleSpy.mock.calls[0][0]);
    const outerOutput = JSON.parse(consoleSpy.mock.calls[1][0]);

    expect(innerOutput.requestId).toBe("inner");
    expect(innerOutput.sessionId).toBe("session-1");
    expect(outerOutput.requestId).toBe("outer");
    expect(outerOutput.sessionId).toBeUndefined();
  });
});
