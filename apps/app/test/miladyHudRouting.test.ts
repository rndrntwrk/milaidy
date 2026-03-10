import { describe, expect, it } from "vitest";
import {
  assetVaultSectionForTab,
  controlSectionForTab,
  defaultTabForControlSection,
  getControlStackSections,
  isTabEnabled,
} from "../src/miladyHudRouting.js";

describe("miladyHudRouting", () => {
  it("maps control-stack tabs through the canonical section contract", () => {
    expect(controlSectionForTab("security")).toBe("security");
    expect(controlSectionForTab("plugins")).toBe("plugins-connectors");
    expect(defaultTabForControlSection("plugins-connectors")).toBe("plugins");
  });

  it("keeps identity dual-use while leaving control-stack precedence explicit", () => {
    expect(controlSectionForTab("identity")).toBe("identity");
    expect(assetVaultSectionForTab("identity")).toBe("identity");
  });

  it("hides apps when the gate is disabled", () => {
    expect(isTabEnabled("apps", { appsEnabled: false })).toBe(false);
    expect(controlSectionForTab("apps", { appsEnabled: false })).toBeNull();
    expect(
      getControlStackSections({ appsEnabled: false }).some(
        (section) => section.id === "apps",
      ),
    ).toBe(false);
  });
});
