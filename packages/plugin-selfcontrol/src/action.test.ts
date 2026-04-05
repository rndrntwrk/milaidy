import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SELFCONTROL_ACCESS_ERROR } from "./access";

const roleMocks = vi.hoisted(() => ({
  checkSenderRole: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: roleMocks.checkSenderRole,
}));

import {
  blockWebsitesAction,
  getWebsiteBlockStatusAction,
  requestWebsiteBlockingPermissionAction,
  unblockWebsitesAction,
} from "./action";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "./selfcontrol";

let tempDir = "";
let hostsFilePath = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
  roleMocks.checkSenderRole.mockReset().mockResolvedValue({
    entityId: "user-1",
    role: "ADMIN",
    isOwner: false,
    isAdmin: true,
    canManageRoles: true,
  });
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  vi.restoreAllMocks();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("blockWebsitesAction", () => {
  it("extracts websites from recent conversation context without the model path", async () => {
    const getMemories = vi.fn().mockResolvedValue([
      {
        entityId: "user-1",
        content: {
          text: "Please block x.com and twitter.com for 30 minutes.",
        },
        createdAt: 1,
      },
    ]);

    const result = await blockWebsitesAction.handler(
      {
        getMemories,
      } as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "do it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a website block/i);
    expect(getMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        count: 16,
      }),
    );

    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  it("falls back to assistant-restated websites when the recent sender turn is shorthand", async () => {
    const getMemories = vi.fn().mockResolvedValue([
      {
        entityId: "assistant-1",
        content: {
          text: "I can block x.com and twitter.com for an hour whenever you want.",
        },
        createdAt: 1,
      },
    ]);

    const result = await blockWebsitesAction.handler(
      {
        getMemories,
      } as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "do it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a website block/i);
    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  it("refuses to start a second block while another one is active", async () => {
    await blockWebsitesAction.handler(
      {} as never,
      {
        content: { text: "Block x.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await blockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("already running");
  });

  it("rejects non-admin users", async () => {
    roleMocks.checkSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const validate = await blockWebsitesAction.validate?.(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "block x.com" },
      } as never,
    );
    expect(validate).toBe(false);

    const result = await blockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "block x.com" },
      } as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: false,
      text: SELFCONTROL_ACCESS_ERROR,
    });
  });

  it("does not block when the current message explicitly says not to block yet", async () => {
    const validate = await blockWebsitesAction.validate?.(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: {
          text: "The websites distracting me are x.com and twitter.com. Do not block them yet.",
        },
      } as never,
    );

    expect(validate).toBe(false);

    const result = await blockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: {
          text: "The websites distracting me are x.com and twitter.com. Do not block them yet.",
        },
      } as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: true,
      text: "I noted those websites and will wait for your confirmation before blocking them.",
      data: {
        deferred: true,
      },
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});

describe("getWebsiteBlockStatusAction", () => {
  it("reports the active block details", async () => {
    await blockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block x.com and twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await getWebsiteBlockStatusAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "status?" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("website block is active");
    expect(result.data).toMatchObject({
      active: true,
      engine: "hosts-file",
      requiresElevation: false,
      websites: ["x.com", "twitter.com"],
    });
  });
});

describe("requestWebsiteBlockingPermissionAction", () => {
  it("reports the website blocking permission state for admin users", async () => {
    const result = await requestWebsiteBlockingPermissionAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "give yourself permission to block websites" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("system hosts file directly");
    expect(result.data).toMatchObject({
      status: "granted",
      canRequest: false,
      hostsFilePath,
      promptAttempted: false,
      promptSucceeded: false,
    });
  });
});

describe("unblockWebsitesAction", () => {
  it("removes an active website block early", async () => {
    await blockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block x.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await unblockWebsitesAction.handler(
      {} as never,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "remove it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("Removed the website block");
    expect(result.data).toMatchObject({
      active: false,
      canUnblockEarly: true,
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});
