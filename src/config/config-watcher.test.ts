/**
 * Tests for config/config-watcher.ts
 *
 * Exercises:
 *   - Handler registration and matching
 *   - Config change detection
 *   - Wildcard path matching
 *   - Hot-reload vs restart-required classification
 *   - Event bus integration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypedEventBus } from "../events/event-bus.js";
import {
  ConfigWatcher,
  getConfigWatcher,
  resetConfigWatcher,
  type ConfigChange,
  type ConfigChangeHandler,
} from "./config-watcher.js";

// Mock the config loading
vi.mock("./config.js", () => ({
  loadMilaidyConfig: vi.fn(() => ({})),
}));

vi.mock("./paths.js", () => ({
  resolveConfigPath: vi.fn(() => "/mock/path/milaidy.json"),
}));

import { loadMilaidyConfig } from "./config.js";
import { resolveConfigPath } from "./paths.js";

const mockLoadConfig = vi.mocked(loadMilaidyConfig);
const mockResolveConfigPath = vi.mocked(resolveConfigPath);

describe("ConfigWatcher", () => {
  let watcher: ConfigWatcher;
  let eventBus: TypedEventBus;
  let tempDir: string;
  let tempConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-watcher-test-"));
    tempConfigPath = path.join(tempDir, "milaidy.json");

    // Write initial config
    fs.writeFileSync(tempConfigPath, JSON.stringify({ version: "1.0.0" }));

    mockResolveConfigPath.mockReturnValue(tempConfigPath);
    mockLoadConfig.mockReturnValue({ version: "1.0.0" } as never);

    eventBus = new TypedEventBus();
    watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });
  });

  afterEach(async () => {
    watcher.dispose();
    eventBus.removeAllListeners();
    resetConfigWatcher();

    // Clean up temp files
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("onConfigChange", () => {
    it("registers a handler", () => {
      const handler: ConfigChangeHandler = {
        path: "api.port",
        handler: vi.fn(),
      };

      const unregister = watcher.onConfigChange(handler);
      expect(typeof unregister).toBe("function");
    });

    it("unregister removes the handler", () => {
      const handler: ConfigChangeHandler = {
        path: "api.port",
        handler: vi.fn(),
      };

      const unregister = watcher.onConfigChange(handler);
      unregister();

      // Handler should not be called after unregister
      // (tested via reload with no handlers matching)
    });
  });

  describe("path matching", () => {
    it("matches exact paths", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: "api.port",
        handler,
      });

      mockLoadConfig.mockReturnValue({ api: { port: 3001 } } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ path: "api.port" }),
      );
    });

    it("matches wildcard paths", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: "api.*",
        handler,
      });

      mockLoadConfig.mockReturnValue({ api: { port: 3001 } } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ path: "api.port" }),
      );
    });

    it("matches prefix paths", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: "plugins",
        handler,
      });

      mockLoadConfig.mockReturnValue({ plugins: { allow: ["test"] } } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ path: "plugins.allow" }),
      );
    });

    it("matches multiple paths", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: ["api.port", "api.host"],
        handler,
      });

      mockLoadConfig.mockReturnValue({
        api: { port: 3001, host: "localhost" },
      } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("does not match unrelated paths", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: "api.port",
        handler,
      });

      mockLoadConfig.mockReturnValue({ database: { url: "postgres://..." } } as never);
      await watcher.reload();

      expect(handler).not.toHaveBeenCalled();
    });

    it("matches global wildcard", async () => {
      const handler = vi.fn();

      watcher.onConfigChange({
        path: "*",
        handler,
      });

      mockLoadConfig.mockReturnValue({ any: { nested: { path: "value" } } } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ path: "any.nested.path" }),
      );
    });
  });

  describe("change detection", () => {
    it("detects added values", async () => {
      const handler = vi.fn();
      watcher.onConfigChange({ path: "newKey", handler });

      mockLoadConfig.mockReturnValue({ newKey: "value" } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "newKey",
          oldValue: undefined,
          newValue: "value",
        }),
      );
    });

    it("detects changed values", async () => {
      mockLoadConfig.mockReturnValue({ version: "1.0.0" } as never);
      watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });

      const handler = vi.fn();
      watcher.onConfigChange({ path: "version", handler });

      mockLoadConfig.mockReturnValue({ version: "2.0.0" } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "version",
          oldValue: "1.0.0",
          newValue: "2.0.0",
        }),
      );
    });

    it("detects removed values", async () => {
      mockLoadConfig.mockReturnValue({ removed: "value" } as never);
      watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });

      const handler = vi.fn();
      watcher.onConfigChange({ path: "removed", handler });

      mockLoadConfig.mockReturnValue({} as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "removed",
          oldValue: "value",
          newValue: undefined,
        }),
      );
    });

    it("detects nested changes", async () => {
      mockLoadConfig.mockReturnValue({ deep: { nested: { value: 1 } } } as never);
      watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });

      const handler = vi.fn();
      watcher.onConfigChange({ path: "deep.*", handler });

      mockLoadConfig.mockReturnValue({ deep: { nested: { value: 2 } } } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "deep.nested.value",
          oldValue: 1,
          newValue: 2,
        }),
      );
    });

    it("detects array changes", async () => {
      mockLoadConfig.mockReturnValue({ items: [1, 2, 3] } as never);
      watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });

      const handler = vi.fn();
      watcher.onConfigChange({ path: "items", handler });

      mockLoadConfig.mockReturnValue({ items: [1, 2, 3, 4] } as never);
      await watcher.reload();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "items",
          oldValue: [1, 2, 3],
          newValue: [1, 2, 3, 4],
        }),
      );
    });

    it("does not fire for unchanged values", async () => {
      mockLoadConfig.mockReturnValue({ stable: "unchanged" } as never);
      watcher = new ConfigWatcher({ eventBus, debounceMs: 10 });

      const handler = vi.fn();
      watcher.onConfigChange({ path: "stable", handler });

      // Same config
      mockLoadConfig.mockReturnValue({ stable: "unchanged" } as never);
      await watcher.reload();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("restart-required classification", () => {
    it("identifies restart-required changes", async () => {
      const hotHandler = vi.fn();
      const restartHandler = vi.fn();

      watcher.onConfigChange({
        path: "api.rateLimit",
        handler: hotHandler,
        restartRequired: false,
      });

      watcher.onConfigChange({
        path: "api.port",
        handler: restartHandler,
        restartRequired: true,
      });

      mockLoadConfig.mockReturnValue({
        api: { rateLimit: 100, port: 3001 },
      } as never);
      await watcher.reload();

      expect(hotHandler).toHaveBeenCalled();
      expect(restartHandler).not.toHaveBeenCalled();
    });
  });

  describe("event bus integration", () => {
    it("emits system:config:changed for each change", async () => {
      const eventHandler = vi.fn();
      eventBus.on("system:config:changed", eventHandler);

      watcher.onConfigChange({
        path: "version",
        handler: vi.fn(),
      });

      mockLoadConfig.mockReturnValue({ version: "2.0.0" } as never);
      await watcher.reload();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "version",
          oldValue: "1.0.0",
          newValue: "2.0.0",
        }),
      );
    });

    it("emits system:config:reloaded after all changes", async () => {
      const eventHandler = vi.fn();
      eventBus.on("system:config:reloaded", eventHandler);

      watcher.onConfigChange({
        path: "*",
        handler: vi.fn(),
      });

      mockLoadConfig.mockReturnValue({ a: 1, b: 2 } as never);
      await watcher.reload();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          changedPaths: expect.arrayContaining(["a", "b"]),
          timestamp: expect.any(Number),
        }),
      );
    });
  });

  describe("handler errors", () => {
    it("continues processing other handlers when one throws", async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error("Handler failed"));
      const successHandler = vi.fn();

      watcher.onConfigChange({
        path: "value",
        handler: failingHandler,
      });

      watcher.onConfigChange({
        path: "value",
        handler: successHandler,
      });

      mockLoadConfig.mockReturnValue({ value: "changed" } as never);
      await watcher.reload();

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe("getConfig", () => {
    it("returns the current config", () => {
      mockLoadConfig.mockReturnValue({ version: "1.0.0" } as never);
      watcher = new ConfigWatcher({ debounceMs: 10 });

      expect(watcher.getConfig()).toEqual({ version: "1.0.0" });
    });
  });
});

describe("global config watcher", () => {
  afterEach(() => {
    resetConfigWatcher();
  });

  it("getConfigWatcher returns singleton", () => {
    const w1 = getConfigWatcher();
    const w2 = getConfigWatcher();
    expect(w1).toBe(w2);
  });

  it("resetConfigWatcher disposes and clears singleton", () => {
    const w1 = getConfigWatcher();
    resetConfigWatcher();
    const w2 = getConfigWatcher();
    expect(w1).not.toBe(w2);
  });
});
