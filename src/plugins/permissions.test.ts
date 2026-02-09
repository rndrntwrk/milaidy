/**
 * Tests for plugins/permissions.ts
 *
 * Exercises:
 *   - Permission guard operations
 *   - Permission checking and throwing
 *   - Permission request flow
 *   - Manifest validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DANGEROUS_PERMISSIONS,
  getPermissionCategory,
  getPermissionGuard,
  PERMISSION_CATEGORIES,
  PERMISSION_DESCRIPTIONS,
  PermissionDeniedError,
  PermissionGuard,
  permissionEvents,
  removePermissionGuard,
  validateManifest,
  type PluginManifest,
  type PluginPermission,
} from "./permissions.js";

describe("PermissionGuard", () => {
  let guard: PermissionGuard;

  beforeEach(() => {
    guard = new PermissionGuard("test-plugin", ["fs:read:workspace"]);
  });

  describe("check()", () => {
    it("succeeds for granted permission", () => {
      expect(() => guard.check("fs:read:workspace")).not.toThrow();
    });

    it("throws PermissionDeniedError for non-granted permission", () => {
      expect(() => guard.check("fs:write:any")).toThrow(PermissionDeniedError);
    });

    it("includes plugin name and permission in error", () => {
      try {
        guard.check("fs:write:any");
      } catch (err) {
        expect(err).toBeInstanceOf(PermissionDeniedError);
        const pde = err as PermissionDeniedError;
        expect(pde.plugin).toBe("test-plugin");
        expect(pde.permission).toBe("fs:write:any");
      }
    });
  });

  describe("has()", () => {
    it("returns true for granted permission", () => {
      expect(guard.has("fs:read:workspace")).toBe(true);
    });

    it("returns false for non-granted permission", () => {
      expect(guard.has("fs:write:any")).toBe(false);
    });
  });

  describe("hasAny()", () => {
    it("returns true if any permission is granted", () => {
      expect(guard.hasAny(["fs:read:workspace", "fs:write:any"])).toBe(true);
    });

    it("returns false if none are granted", () => {
      expect(guard.hasAny(["fs:write:any", "net:outbound:http"])).toBe(false);
    });
  });

  describe("hasAll()", () => {
    it("returns true if all permissions are granted", () => {
      guard.grant("fs:write:workspace");
      expect(guard.hasAll(["fs:read:workspace", "fs:write:workspace"])).toBe(true);
    });

    it("returns false if any permission is missing", () => {
      expect(guard.hasAll(["fs:read:workspace", "fs:write:any"])).toBe(false);
    });
  });

  describe("grant() and revoke()", () => {
    it("grant adds permission", () => {
      expect(guard.has("net:outbound:https")).toBe(false);
      guard.grant("net:outbound:https");
      expect(guard.has("net:outbound:https")).toBe(true);
    });

    it("revoke removes permission", () => {
      expect(guard.has("fs:read:workspace")).toBe(true);
      guard.revoke("fs:read:workspace");
      expect(guard.has("fs:read:workspace")).toBe(false);
    });
  });

  describe("getGrantedPermissions()", () => {
    it("returns all granted permissions", () => {
      guard.grant("net:outbound:https");
      guard.grant("ai:inference");

      const perms = guard.getGrantedPermissions();
      expect(perms).toContain("fs:read:workspace");
      expect(perms).toContain("net:outbound:https");
      expect(perms).toContain("ai:inference");
    });
  });
});

describe("PermissionGuard request()", () => {
  let guard: PermissionGuard;

  beforeEach(() => {
    guard = new PermissionGuard("request-test-plugin");
    permissionEvents.removeAllListeners();
  });

  afterEach(() => {
    permissionEvents.removeAllListeners();
  });

  it("returns true for already granted permission", async () => {
    guard.grant("ai:inference");
    const result = await guard.request("ai:inference", "Need AI access");
    expect(result).toBe(true);
  });

  it("auto-approves non-dangerous permissions when no listeners", async () => {
    const result = await guard.request("ai:inference", "Need AI access");
    expect(result).toBe(true);
    expect(guard.has("ai:inference")).toBe(true);
  });

  it("auto-denies dangerous permissions when no listeners", async () => {
    const result = await guard.request("fs:write:any", "Need write access");
    expect(result).toBe(false);
    expect(guard.has("fs:write:any")).toBe(false);
  });

  it("emits permission request event", async () => {
    const handler = vi.fn((request, callback) => {
      expect(request.plugin).toBe("request-test-plugin");
      expect(request.permission).toBe("net:outbound:https");
      expect(request.reason).toBe("Need to fetch data");
      callback(true);
    });

    permissionEvents.on("permission:request", handler);

    await guard.request("net:outbound:https", "Need to fetch data");

    expect(handler).toHaveBeenCalled();
  });

  it("grants permission when callback receives true", async () => {
    permissionEvents.on("permission:request", (_, callback) => callback(true));

    const result = await guard.request("data:secrets", "Need secrets");

    expect(result).toBe(true);
    expect(guard.has("data:secrets")).toBe(true);
  });

  it("denies permission when callback receives false", async () => {
    permissionEvents.on("permission:request", (_, callback) => callback(false));

    const result = await guard.request("data:secrets", "Need secrets");

    expect(result).toBe(false);
    expect(guard.has("data:secrets")).toBe(false);
  });
});

describe("getPermissionGuard / removePermissionGuard", () => {
  afterEach(() => {
    removePermissionGuard("registry-test");
  });

  it("creates new guard if not exists", () => {
    const guard = getPermissionGuard("registry-test", ["ai:inference"]);
    expect(guard.has("ai:inference")).toBe(true);
  });

  it("returns existing guard", () => {
    const guard1 = getPermissionGuard("registry-test", ["ai:inference"]);
    const guard2 = getPermissionGuard("registry-test");

    expect(guard1).toBe(guard2);
  });

  it("removePermissionGuard removes the guard", () => {
    const guard1 = getPermissionGuard("registry-test", ["ai:inference"]);
    removePermissionGuard("registry-test");
    const guard2 = getPermissionGuard("registry-test");

    expect(guard1).not.toBe(guard2);
    expect(guard2.has("ai:inference")).toBe(false);
  });
});

describe("validateManifest", () => {
  const validManifest: PluginManifest = {
    name: "test-plugin",
    version: "1.0.0",
    description: "Test plugin",
    permissions: {
      required: ["ai:inference"],
      optional: ["net:outbound:https"],
    },
  };

  it("accepts valid manifest", () => {
    const result = validateManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null", () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
  });

  it("rejects missing name", () => {
    const result = validateManifest({
      ...validManifest,
      name: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest must have a name");
  });

  it("rejects missing version", () => {
    const result = validateManifest({
      ...validManifest,
      version: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest must have a version");
  });

  it("rejects missing permissions object", () => {
    const { permissions, ...noPerms } = validManifest;
    const result = validateManifest(noPerms);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Manifest must have permissions object");
  });

  it("rejects invalid permission values", () => {
    const result = validateManifest({
      ...validManifest,
      permissions: {
        required: ["invalid:permission" as PluginPermission],
        optional: [],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid permission"))).toBe(true);
  });
});

describe("PERMISSION_CATEGORIES", () => {
  it("covers all permissions", () => {
    const allCategoryPerms = Object.values(PERMISSION_CATEGORIES).flatMap(
      (c) => c.permissions,
    );
    const allDescribedPerms = Object.keys(PERMISSION_DESCRIPTIONS);

    for (const perm of allDescribedPerms) {
      expect(allCategoryPerms).toContain(perm);
    }
  });
});

describe("DANGEROUS_PERMISSIONS", () => {
  it("includes expected dangerous permissions", () => {
    expect(DANGEROUS_PERMISSIONS.has("fs:write:any")).toBe(true);
    expect(DANGEROUS_PERMISSIONS.has("process:shell")).toBe(true);
    expect(DANGEROUS_PERMISSIONS.has("data:secrets")).toBe(true);
  });

  it("does not include safe permissions", () => {
    expect(DANGEROUS_PERMISSIONS.has("ai:inference")).toBe(false);
    expect(DANGEROUS_PERMISSIONS.has("net:outbound:https")).toBe(false);
  });
});

describe("getPermissionCategory", () => {
  it("returns correct category for filesystem permission", () => {
    expect(getPermissionCategory("fs:read:workspace")).toBe("filesystem");
  });

  it("returns correct category for network permission", () => {
    expect(getPermissionCategory("net:outbound:https")).toBe("network");
  });

  it("returns correct category for AI permission", () => {
    expect(getPermissionCategory("ai:inference")).toBe("ai");
  });

  it("returns unknown for invalid permission", () => {
    expect(getPermissionCategory("invalid" as PluginPermission)).toBe("unknown");
  });
});
