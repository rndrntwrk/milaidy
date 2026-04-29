import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ABI_TARGETS,
  compareSemver,
  LLAMA_CPP_COMMIT,
  LLAMA_CPP_TAG,
  MIN_ZIG_VERSION,
  parseArgs,
  probeZig,
} from "./compile-libllama.mjs";

describe("compile-libllama args", () => {
  it("defaults to both ABIs and the cache dir under ~/.cache/milady-android-agent", () => {
    const args = parseArgs([]);
    expect(args.abis).toEqual(["arm64-v8a", "x86_64"]);
    expect(args.cacheDir).toBe(
      path.join(
        os.homedir(),
        ".cache",
        "milady-android-agent",
        `llama-cpp-${LLAMA_CPP_TAG}`,
      ),
    );
    expect(args.skipIfPresent).toBe(false);
    expect(typeof args.androidAssetsDir).toBe("string");
    expect(args.androidAssetsDir).toContain(
      path.join(
        "apps",
        "app",
        "android",
        "app",
        "src",
        "main",
        "assets",
        "agent",
      ),
    );
  });

  it("--abi narrows to one ABI", () => {
    expect(parseArgs(["--abi", "arm64-v8a"]).abis).toEqual(["arm64-v8a"]);
    expect(parseArgs(["--abi", "x86_64"]).abis).toEqual(["x86_64"]);
  });

  it("--abi rejects unsupported values", () => {
    expect(() => parseArgs(["--abi", "armeabi-v7a"])).toThrow(
      /--abi must be one of/,
    );
  });

  it("--jobs / -j must be a positive integer", () => {
    expect(parseArgs(["--jobs", "4"]).jobs).toBe(4);
    expect(parseArgs(["-j", "8"]).jobs).toBe(8);
    expect(() => parseArgs(["--jobs", "0"])).toThrow(
      /--jobs must be a positive integer/,
    );
    expect(() => parseArgs(["--jobs", "-2"])).toThrow(
      /--jobs must be a positive integer/,
    );
  });

  it("flags requiring values reject missing values", () => {
    expect(() => parseArgs(["--assets-dir"])).toThrow(
      /--assets-dir requires a value/,
    );
    expect(() => parseArgs(["--cache-dir"])).toThrow(
      /--cache-dir requires a value/,
    );
    expect(() => parseArgs(["--abi"])).toThrow(/--abi requires a value/);
    expect(() => parseArgs(["--jobs"])).toThrow(/--jobs requires a value/);
  });

  it("rejects unknown flags rather than treating them as positional paths", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });

  it("accepts --skip-if-present idempotency switch", () => {
    expect(parseArgs(["--skip-if-present"]).skipIfPresent).toBe(true);
  });
});

describe("compile-libllama version comparison", () => {
  it("compareSemver handles dev/release/v-prefixed inputs deterministically", () => {
    expect(compareSemver("0.13.0", "0.13.0")).toBe(0);
    expect(compareSemver("0.12.0", "0.13.0")).toBeLessThan(0);
    expect(compareSemver("0.14.0", "0.13.0")).toBeGreaterThan(0);
    expect(compareSemver("v0.13.0", "0.13.0")).toBe(0);
    // dev-build suffix is stripped before comparison
    expect(compareSemver("0.13.0-dev.1234+abcdef", "0.13.0")).toBe(0);
    expect(
      compareSemver("0.13.0-dev.1234+abcdef", "0.13.0-dev.5678+ffff"),
    ).toBe(0);
    expect(compareSemver("1.0.0", "0.99.0")).toBeGreaterThan(0);
  });
});

describe("compile-libllama toolchain probe", () => {
  it("throws an actionable install hint when zig is missing", () => {
    const fakeSpawn = () => ({
      error: new Error("ENOENT"),
      status: null,
      stdout: "",
      stderr: "",
    });
    expect(() => probeZig({ spawn: fakeSpawn, platform: "linux" })).toThrow(
      /zig is required/,
    );
    expect(() => probeZig({ spawn: fakeSpawn, platform: "linux" })).toThrow(
      /snap install zig/,
    );
    expect(() => probeZig({ spawn: fakeSpawn, platform: "darwin" })).toThrow(
      /brew install zig/,
    );
  });

  it("rejects zig versions below the required minimum", () => {
    const fakeSpawn = () => ({
      error: null,
      status: 0,
      stdout: "0.12.1\n",
      stderr: "",
    });
    expect(() => probeZig({ spawn: fakeSpawn, platform: "linux" })).toThrow(
      new RegExp(`zig 0\\.12\\.1 is too old.*${MIN_ZIG_VERSION}`),
    );
  });

  it("returns the version string on a passing probe", () => {
    const fakeSpawn = () => ({
      error: null,
      status: 0,
      stdout: "0.13.0\n",
      stderr: "",
    });
    expect(probeZig({ spawn: fakeSpawn, platform: "linux" })).toBe("0.13.0");
  });
});

describe("compile-libllama pinned constants", () => {
  it("matches the SHA referenced in eliza/packages/agent/src/runtime/aosp-llama-adapter.ts", () => {
    expect(LLAMA_CPP_TAG).toBe("b3490");
    expect(LLAMA_CPP_COMMIT).toBe("6e2b6000e5fe808954a7dcef8225b5b7f2c1b9e9");
  });

  it("declares a target row for each supported Android ABI", () => {
    expect(ABI_TARGETS.map((t) => t.androidAbi)).toEqual([
      "arm64-v8a",
      "x86_64",
    ]);
    for (const target of ABI_TARGETS) {
      expect(target.zigTarget).toMatch(/^(aarch64|x86_64)-linux-musl$/);
      expect(target.cmakeProcessor).toMatch(/^(aarch64|x86_64)$/);
    }
  });
});
