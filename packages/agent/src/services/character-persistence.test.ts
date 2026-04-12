import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration test for character persistence — no module mocks.
 *
 * Uses real config file I/O by pointing the config path resolution at temp
 * directories via env vars.
 */

import {
  MiladyCharacterPersistenceService,
  syncCharacterIntoConfig,
} from "./character-persistence";

let tmpDir: string;
let tmpConfigPath: string;

const ENV_KEYS = [
  "MILADY_CONFIG_PATH",
  "MILADY_PERSIST_CONFIG_PATH",
  "MILADY_STATE_DIR",
  "ELIZA_CONFIG_PATH",
  "ELIZA_PERSIST_CONFIG_PATH",
  "ELIZA_STATE_DIR",
] as const;

const envBackup = new Map<string, string | undefined>();

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("syncCharacterIntoConfig", () => {
  it("copies runtime character fields into the primary agent config", () => {
    const config = {
      agents: {
        list: [{ id: "main", default: true, name: "Old Milady" }],
      },
      ui: {
        assistant: {
          name: "Old Milady",
        },
      },
    };

    syncCharacterIntoConfig(config as never, {
      name: "Milady",
      username: "milady",
      bio: ["Helpful", "Direct"],
      system: "You are Milady.",
      adjectives: ["helpful"],
      topics: ["agents"],
      style: { chat: ["Keep it short."] },
      postExamples: ["example post"],
      messageExamples: [{ examples: [] }],
    } as never);

    expect(config.agents?.list?.[0]).toMatchObject({
      name: "Milady",
      username: "milady",
      bio: ["Helpful", "Direct"],
      system: "You are Milady.",
      adjectives: ["helpful"],
      topics: ["agents"],
      style: { chat: ["Keep it short."] },
      postExamples: ["example post"],
    });
    expect(config.ui?.assistant?.name).toBe("Milady");
  });
});

describe("MiladyCharacterPersistenceService", () => {
  let runtime: IAgentRuntime & {
    updateAgent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-charpersist-"));
    tmpConfigPath = path.join(tmpDir, "milady.json");

    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
      delete process.env[key];
    }

    // Point the real config loader/saver at our temp directory
    process.env.MILADY_CONFIG_PATH = tmpConfigPath;
    process.env.MILADY_PERSIST_CONFIG_PATH = tmpConfigPath;
    process.env.MILADY_STATE_DIR = tmpDir;

    // Write an initial config file
    writeJson(tmpConfigPath, {
      agents: {
        list: [{ id: "main", default: true, name: "Old Milady" }],
      },
      ui: {
        assistant: {
          name: "Old Milady",
        },
      },
    });

    runtime = {
      agentId: "agent-1",
      character: {
        name: "Milady",
        bio: ["Helpful assistant"],
        system: "You are Milady.",
        topics: ["agents"],
        style: { chat: ["Keep responses concise."] },
        metadata: { existing: true },
      },
      updateAgent: vi.fn(async () => undefined),
      getSetting: vi.fn(() => null),
    } as unknown as IAgentRuntime & {
      updateAgent: ReturnType<typeof vi.fn>;
    };
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envBackup.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    envBackup.clear();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists runtime character changes to config and agent storage", async () => {
    const service = new MiladyCharacterPersistenceService(runtime);

    const result = await service.persistCharacter();

    expect(result).toEqual({ success: true });

    // Verify the config file was actually written
    expect(fs.existsSync(tmpConfigPath)).toBe(true);
    const savedConfig = readJson(tmpConfigPath) as Record<string, unknown>;
    expect(savedConfig).toBeDefined();

    expect(runtime.updateAgent).toHaveBeenCalledWith("agent-1", {
      name: "Milady",
      metadata: {
        existing: true,
        character: {
          name: "Milady",
          bio: ["Helpful assistant"],
          system: "You are Milady.",
          topics: ["agents"],
          style: { chat: ["Keep responses concise."] },
        },
      },
    });
  });

  it("implements the required static start method", async () => {
    const service = await MiladyCharacterPersistenceService.start(runtime);

    expect(service).toBeInstanceOf(MiladyCharacterPersistenceService);
  });
});
