import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration test for inbox triage config — no mocks.
 *
 * Instead of mocking loadElizaConfig, we write real config files into a temp
 * directory and point the real config resolution at them via env vars.
 */

let tmpDir: string;
let tmpConfigPath: string;

const ENV_KEYS = [
  "MILADY_CONFIG_PATH",
  "MILADY_STATE_DIR",
  "ELIZA_CONFIG_PATH",
  "ELIZA_STATE_DIR",
] as const;

const envBackup = new Map<string, string | undefined>();

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("loadInboxTriageConfig", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-inbox-cfg-"));
    tmpConfigPath = path.join(tmpDir, "milady.json");

    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key]);
      delete process.env[key];
    }

    // Point the real config loader at our temp config
    process.env.MILADY_CONFIG_PATH = tmpConfigPath;
    process.env.MILADY_STATE_DIR = tmpDir;
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

  it("returns full defaults when no config is set", async () => {
    // Write an empty config file so loadElizaConfig does not throw
    writeJson(tmpConfigPath, {});

    const { loadInboxTriageConfig } = await import("../config");
    const cfg = loadInboxTriageConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoReply?.enabled).toBe(false);
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(5);
    expect(cfg.triageRules?.alwaysUrgent).toEqual([]);
    expect(cfg.retentionDays).toBe(30);
  });

  it("deep-merges autoReply so partial overrides keep defaults", async () => {
    writeJson(tmpConfigPath, {
      agents: {
        defaults: {
          inboxTriage: {
            autoReply: { enabled: true },
          },
        },
      },
    });

    const { loadInboxTriageConfig } = await import("../config");
    const cfg = loadInboxTriageConfig();

    // User override applied
    expect(cfg.autoReply?.enabled).toBe(true);
    // Defaults preserved (the shallow-merge bug lost these)
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(5);
    expect(cfg.autoReply?.senderWhitelist).toEqual([]);
    expect(cfg.autoReply?.channelWhitelist).toEqual([]);
  });

  it("deep-merges triageRules so partial overrides keep defaults", async () => {
    writeJson(tmpConfigPath, {
      agents: {
        defaults: {
          inboxTriage: {
            triageRules: { alwaysUrgent: ["keyword:fire"] },
          },
        },
      },
    });

    const { loadInboxTriageConfig } = await import("../config");
    const cfg = loadInboxTriageConfig();

    expect(cfg.triageRules?.alwaysUrgent).toEqual(["keyword:fire"]);
    // Defaults preserved
    expect(cfg.triageRules?.alwaysIgnore).toEqual([]);
    expect(cfg.triageRules?.alwaysNotify).toEqual([]);
  });

  it("top-level overrides still apply alongside nested deep-merge", async () => {
    writeJson(tmpConfigPath, {
      agents: {
        defaults: {
          inboxTriage: {
            enabled: true,
            retentionDays: 7,
            autoReply: { maxAutoRepliesPerHour: 20 },
          },
        },
      },
    });

    const { loadInboxTriageConfig } = await import("../config");
    const cfg = loadInboxTriageConfig();

    expect(cfg.enabled).toBe(true);
    expect(cfg.retentionDays).toBe(7);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(20);
    // Default nested fields preserved
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.triageRules?.alwaysUrgent).toEqual([]);
    // Default top-level fields preserved
    expect(cfg.triageCron).toBe("0 * * * *");
    expect(cfg.digestCron).toBe("0 8 * * *");
  });

  it("falls back to defaults when config file does not exist", async () => {
    // Don't write any config file -- loadElizaConfig should handle this gracefully
    // (either returns empty or throws, inbox config catches and returns defaults)
    const { loadInboxTriageConfig } = await import("../config");
    const cfg = loadInboxTriageConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
  });
});
