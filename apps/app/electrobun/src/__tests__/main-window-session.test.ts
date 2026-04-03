import { describe, expect, it } from "vitest";

import { resolveMainWindowPartition } from "../main-window-session";

describe("resolveMainWindowPartition", () => {
  it("returns null by default", () => {
    expect(resolveMainWindowPartition({})).toBeNull();
  });

  it("returns the explicit desktop test partition override", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "persist:bootstrap-isolated",
      }),
    ).toBe("persist:bootstrap-isolated");
  });

  it("normalizes bare desktop test partition overrides to persistent CEF partitions", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "bootstrap-isolated",
      }),
    ).toBe("persist:bootstrap-isolated");
  });

  it("falls back to the packaged bootstrap partition when the external test API is enabled", () => {
    expect(
      resolveMainWindowPartition(
        {
          MILADY_DESKTOP_TEST_API_BASE: "http://127.0.0.1:43123",
        },
        "darwin",
      ),
    ).toBe("persist:bootstrap-isolated");
  });

  it("uses a non-persistent session for the packaged Windows bootstrap harness", () => {
    expect(
      resolveMainWindowPartition(
        {
          MILADY_DESKTOP_TEST_API_BASE: "http://127.0.0.1:43123",
        },
        "win32",
      ),
    ).toBe("bootstrap-isolated");
  });

  it("ignores blank partition overrides", () => {
    expect(
      resolveMainWindowPartition({
        MILADY_DESKTOP_TEST_PARTITION: "   ",
      }),
    ).toBeNull();
  });
});
