/**
 * Tests for risk-classification.ts
 */

import { describe, expect, it } from "vitest";
import type { PluginPermission } from "../../plugins/permissions.js";
import { classifyRisk } from "./risk-classification.js";

describe("classifyRisk", () => {
  it("returns read-only when no permissions are required", () => {
    expect(classifyRisk([])).toBe("read-only");
  });

  it("returns read-only for read-only permissions", () => {
    expect(classifyRisk(["fs:read:workspace", "fs:read:home"])).toBe(
      "read-only",
    );
  });

  it("returns reversible for write permissions that are not dangerous", () => {
    expect(classifyRisk(["ai:inference", "net:outbound:https"])).toBe(
      "reversible",
    );
    expect(classifyRisk(["fs:write:workspace"])).toBe("reversible");
    expect(classifyRisk(["process:spawn"])).toBe("reversible");
    expect(classifyRisk(["data:database"])).toBe("reversible");
  });

  it("returns irreversible for dangerous permissions", () => {
    expect(classifyRisk(["process:shell"])).toBe("irreversible");
    expect(classifyRisk(["fs:write:any"])).toBe("irreversible");
    expect(classifyRisk(["system:native"])).toBe("irreversible");
    expect(classifyRisk(["system:ffi"])).toBe("irreversible");
    expect(classifyRisk(["data:secrets"])).toBe("irreversible");
    expect(classifyRisk(["process:env:write"])).toBe("irreversible");
    expect(classifyRisk(["fs:read:system"])).toBe("irreversible");
  });

  it("returns irreversible when mix includes any dangerous permission", () => {
    expect(classifyRisk(["ai:inference", "process:shell"])).toBe(
      "irreversible",
    );
    expect(classifyRisk(["fs:read:workspace", "fs:write:any"])).toBe(
      "irreversible",
    );
  });

  it("returns reversible for mixed non-dangerous write and read permissions", () => {
    expect(classifyRisk(["fs:read:workspace", "ai:inference"])).toBe(
      "reversible",
    );
  });

  it("handles all dangerous permissions from DANGEROUS_PERMISSIONS set", () => {
    const dangerous: PluginPermission[] = [
      "fs:write:any",
      "fs:read:system",
      "process:shell",
      "process:env:write",
      "system:native",
      "system:ffi",
      "data:secrets",
    ];
    for (const perm of dangerous) {
      expect(classifyRisk([perm])).toBe("irreversible");
    }
  });
});
