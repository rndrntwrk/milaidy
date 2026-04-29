import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ABI_TARGETS,
  compareSemver,
  ensureZigDrivers,
  LLAMA_CPP_COMMIT,
  LLAMA_CPP_TAG,
  MIN_ZIG_VERSION,
  parseArgs,
  patchLlamaCppSourceForMusl,
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

describe("compile-libllama zig driver scripts", () => {
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "compile-libllama-test-"),
    );
  });

  afterEach(() => {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  it("writes per-ABI zig-cc / zig-cxx scripts that wrap zig with --target", () => {
    const { ccPath, cxxPath } = ensureZigDrivers({
      cacheDir: scratchDir,
      abi: "arm64-v8a",
      zigBin: "/opt/zig/zig",
    });
    expect(ccPath).toBe(
      path.join(scratchDir, "zig-driver", "arm64-v8a", "zig-cc"),
    );
    expect(cxxPath).toBe(
      path.join(scratchDir, "zig-driver", "arm64-v8a", "zig-cxx"),
    );
    const ccBody = fs.readFileSync(ccPath, "utf8");
    const cxxBody = fs.readFileSync(cxxPath, "utf8");
    expect(ccBody).toContain('exec "/opt/zig/zig" cc --target=aarch64-linux-musl');
    expect(cxxBody).toContain('exec "/opt/zig/zig" c++ --target=aarch64-linux-musl');
    // Driver scripts must be executable so cmake can invoke them.
    expect(fs.statSync(ccPath).mode & 0o111).not.toBe(0);
    expect(fs.statSync(cxxPath).mode & 0o111).not.toBe(0);
  });

  it("emits a different triple per ABI", () => {
    const arm = ensureZigDrivers({
      cacheDir: scratchDir,
      abi: "arm64-v8a",
      zigBin: "zig",
    });
    const x86 = ensureZigDrivers({
      cacheDir: scratchDir,
      abi: "x86_64",
      zigBin: "zig",
    });
    const armCc = fs.readFileSync(arm.ccPath, "utf8");
    const x86Cc = fs.readFileSync(x86.ccPath, "utf8");
    expect(armCc).toContain("--target=aarch64-linux-musl");
    expect(x86Cc).toContain("--target=x86_64-linux-musl");
  });

  it("rejects unknown ABIs", () => {
    expect(() =>
      ensureZigDrivers({
        cacheDir: scratchDir,
        // @ts-expect-error -- intentional bad input
        abi: "armeabi-v7a",
        zigBin: "zig",
      }),
    ).toThrow(/Unknown ABI/);
  });
});

describe("compile-libllama musl source patch", () => {
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "compile-libllama-test-"),
    );
    fs.mkdirSync(path.join(scratchDir, "ggml", "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  const PRE_IMAGE_BLOCK =
    "#if defined(__linux__)\n" +
    "#include <execinfo.h>\n" +
    "static void ggml_print_backtrace_symbols(void) {\n" +
    "    void * trace[100];\n" +
    "    int nptrs = backtrace(trace, sizeof(trace)/sizeof(trace[0]));\n" +
    "    backtrace_symbols_fd(trace, nptrs, STDERR_FILENO);\n" +
    "}\n" +
    "#else\n" +
    "static void ggml_print_backtrace_symbols(void) {\n" +
    "    // platform not supported\n" +
    "}\n" +
    "#endif\n";

  it("rewrites the __linux__ guard to require __GLIBC__ on first run", () => {
    const file = path.join(scratchDir, "ggml", "src", "ggml.c");
    fs.writeFileSync(
      file,
      `// preamble\n${PRE_IMAGE_BLOCK}// trailing code\n`,
      "utf8",
    );
    patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} });
    const after = fs.readFileSync(file, "utf8");
    expect(after).toContain("#if defined(__linux__) && defined(__GLIBC__)");
    expect(after).not.toContain("#if defined(__linux__)\n#include <execinfo.h>");
    expect(
      fs.existsSync(
        path.join(scratchDir, `.musl-execinfo-patched.${LLAMA_CPP_COMMIT}`),
      ),
    ).toBe(true);
  });

  it("is idempotent — second invocation is a no-op", () => {
    const file = path.join(scratchDir, "ggml", "src", "ggml.c");
    fs.writeFileSync(file, PRE_IMAGE_BLOCK, "utf8");
    patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} });
    const firstPass = fs.readFileSync(file, "utf8");
    patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} });
    const secondPass = fs.readFileSync(file, "utf8");
    expect(secondPass).toBe(firstPass);
  });

  it("no-ops when source already gates execinfo on __GLIBC__ (b4500+ pin path)", () => {
    const file = path.join(scratchDir, "ggml", "src", "ggml.c");
    const upstreamFixed =
      "// preamble\n" +
      "#elif defined(__linux__) && defined(__GLIBC__)\n" +
      "#include <execinfo.h>\n" +
      "static void ggml_print_backtrace_symbols(void) {\n" +
      "    backtrace_symbols_fd(NULL, 0, 0);\n" +
      "}\n" +
      "// trailing code\n";
    fs.writeFileSync(file, upstreamFixed, "utf8");
    patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} });
    expect(fs.readFileSync(file, "utf8")).toBe(upstreamFixed);
    expect(
      fs.existsSync(
        path.join(scratchDir, `.musl-execinfo-patched.${LLAMA_CPP_COMMIT}`),
      ),
    ).toBe(true);
  });

  it("fails loudly when ggml.c doesn't contain the expected pre-image (drift detection)", () => {
    const file = path.join(scratchDir, "ggml", "src", "ggml.c");
    fs.writeFileSync(file, "// totally different code\n", "utf8");
    expect(() =>
      patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} }),
    ).toThrow(/Could not locate expected execinfo\.h block/);
  });

  it("treats source patch as drift-detection when only one of guard/include is present", () => {
    const file = path.join(scratchDir, "ggml", "src", "ggml.c");
    // Has __GLIBC__ guard but no execinfo include — that's drift.
    fs.writeFileSync(
      file,
      "#if defined(__linux__) && defined(__GLIBC__)\n// no execinfo here\n",
      "utf8",
    );
    expect(() =>
      patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} }),
    ).toThrow(/Could not locate expected execinfo\.h block/);
  });

  it("fails loudly when ggml.c is missing entirely", () => {
    expect(() =>
      patchLlamaCppSourceForMusl({ srcDir: scratchDir, log: () => {} }),
    ).toThrow(/Cannot patch ggml\.c/);
  });
});

describe("compile-libllama pinned constants", () => {
  it("matches the SHA referenced in eliza/packages/agent/src/runtime/aosp-llama-adapter.ts", () => {
    // b4500 — the first stable tag exposing both the post-rewrite sampler
    // chain API and the renamed model/vocab API the adapter binds. b3490
    // (the spike pin) shipped neither and dlsym would have returned NULL
    // for every renamed symbol.
    expect(LLAMA_CPP_TAG).toBe("b4500");
    expect(LLAMA_CPP_COMMIT).toBe("a133566d34a1dd3693c504786963bf1b7b7d8c0e");
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
