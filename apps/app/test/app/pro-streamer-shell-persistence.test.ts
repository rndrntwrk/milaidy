// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  enableProStreamerShellMode,
  loadUiShellMode,
  saveUiShellMode,
} from "@milady/app-core/state";

const UI_SHELL_MODE_STORAGE_KEY = "milady:ui-shell-mode";
const PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY =
  "milady:pro-streamer-shell-default";

describe("pro streamer shell persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults milady-os sessions into the native pro streamer shell", () => {
    expect(loadUiShellMode("milady-os")).toBe("native");
    expect(localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY)).toBe("native");
    expect(localStorage.getItem(PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY)).toBe(
      "2026-03-18",
    );
  });

  it("migrates stale milady-os companion sessions once", () => {
    localStorage.setItem(UI_SHELL_MODE_STORAGE_KEY, "companion");

    expect(loadUiShellMode("milady-os")).toBe("native");
    expect(localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY)).toBe("native");
  });

  it("preserves an explicit later companion choice after the migration stamp exists", () => {
    expect(loadUiShellMode("milady-os")).toBe("native");
    saveUiShellMode("companion");

    expect(loadUiShellMode("milady-os")).toBe("companion");
  });

  it("keeps non-milady themes on the legacy companion default", () => {
    expect(loadUiShellMode("milady")).toBe("companion");
    expect(localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY)).toBeNull();
  });

  it("pins the shell to native when pro streamer is explicitly re-enabled", () => {
    saveUiShellMode("companion");

    expect(enableProStreamerShellMode()).toBe("native");
    expect(localStorage.getItem(UI_SHELL_MODE_STORAGE_KEY)).toBe("native");
    expect(localStorage.getItem(PRO_STREAMER_SHELL_DEFAULT_STORAGE_KEY)).toBe(
      "2026-03-18",
    );
  });
});
