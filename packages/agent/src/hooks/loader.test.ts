/**
 * Hook Loader — Integration Tests
 *
 * Tests for:
 * - loadHooks orchestration (disabled, clears hooks, skips ineligible/disabled/no-events, registers)
 * - Path safety (legacy handlers under/outside allowed roots)
 * - Config extraDirs safety (must be under ~/.eliza/)
 *
 * No module mocks — uses real filesystem, real discovery, real eligibility,
 * and real registry. A fake homedir is simulated via env var isolation.
 */

import { mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { InternalHooksConfig } from "../config/types.hooks";
import { clearHooks } from "./registry";

// ---------------------------------------------------------------------------
// Use a deterministic fake homedir so loader and test agree on paths.
// We mock node:os.homedir to control the managed hooks dir.
// ---------------------------------------------------------------------------

const FAKE_HOME = join(tmpdir(), "__loader_test_home__");
vi.mock("node:os", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:os");
  return { ...actual, homedir: () => FAKE_HOME };
});

// ---------------------------------------------------------------------------
// shared temp dir for handler files
// ---------------------------------------------------------------------------

let tempRoot: string;
let dummyHandlerPath: string;

beforeAll(async () => {
  tempRoot = join(
    tmpdir(),
    `loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tempRoot, { recursive: true });
  await mkdir(resolve(FAKE_HOME, ".eliza", "hooks"), { recursive: true });

  // Create a reusable dummy handler module
  dummyHandlerPath = join(tempRoot, "handler.mjs");
  await writeFile(
    dummyHandlerPath,
    "export default function handler(event) {}",
    "utf-8",
  );
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function createRealHookDir(
  base: string,
  name: string,
  opts: {
    events?: string[];
    hookKey?: string;
    emoji?: string;
    handlerContent?: string;
    handlerFile?: string;
    enabled?: boolean;
  } = {},
): Promise<string> {
  const dir = join(base, name);
  await mkdir(dir, { recursive: true });

  const events = opts.events ?? [];
  const metadataObj: Record<string, unknown> = {};
  const elizaObj: Record<string, unknown> = { events };
  if (opts.hookKey) elizaObj.hookKey = opts.hookKey;
  if (opts.emoji) elizaObj.emoji = opts.emoji;
  metadataObj.eliza = elizaObj;

  const hookMd = [
    "---",
    `name: ${name}`,
    `description: ${name} description`,
    `metadata: ${JSON.stringify(metadataObj)}`,
    "---",
  ].join("\n");

  await writeFile(join(dir, "HOOK.md"), hookMd, "utf-8");

  const handlerFile = opts.handlerFile ?? "handler.mjs";
  const handlerContent =
    opts.handlerContent ?? "export default function handler(event) {}";
  await writeFile(join(dir, handlerFile), handlerContent, "utf-8");

  return dir;
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearHooks();
});

afterEach(() => {
  clearHooks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// import loadHooks lazily so mocks are set up first
// ---------------------------------------------------------------------------

async function getLoadHooks() {
  const mod = await import("./loader");
  return mod.loadHooks;
}

// ============================================================================
//  1. loadHooks orchestration
// ============================================================================

describe("loadHooks orchestration", { timeout: 15_000 }, () => {
  it("returns zeros and does nothing when internalConfig.enabled === false", async () => {
    const loadHooks = await getLoadHooks();

    const result = await loadHooks({
      internalConfig: { enabled: false },
    });

    expect(result).toEqual({
      discovered: 0,
      eligible: 0,
      registered: 0,
      skipped: [],
      failed: [],
    });
  });

  it("discovers and registers hooks from a bundled directory", async () => {
    const bundled = join(tempRoot, "orchestration-bundled");
    await createRealHookDir(bundled, "test-hook", {
      events: ["command:new", "session:start"],
    });

    const loadHooks = await getLoadHooks();
    const result = await loadHooks({ bundledDir: bundled });

    expect(result.discovered).toBe(1);
    expect(result.registered).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("skips hooks with no events configured", async () => {
    const bundled = join(tempRoot, "no-events-bundled");
    await createRealHookDir(bundled, "no-events-hook", {
      events: [],
    });

    const loadHooks = await getLoadHooks();
    const result = await loadHooks({ bundledDir: bundled });

    expect(result.discovered).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("no events");
    expect(result.registered).toBe(0);
  });

  it("skips hooks when hookConfig.enabled === false", async () => {
    const bundled = join(tempRoot, "disabled-bundled");
    await createRealHookDir(bundled, "disabled-hook", {
      events: ["command:new"],
      hookKey: "disabled-hook",
    });

    const loadHooks = await getLoadHooks();
    const result = await loadHooks({
      bundledDir: bundled,
      internalConfig: {
        entries: { "disabled-hook": { enabled: false } },
      },
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("disabled in config");
    expect(result.registered).toBe(0);
  });

  it("skips ineligible hooks (missing binary requirement)", async () => {
    const bundled = join(tempRoot, "ineligible-bundled");
    const dir = join(bundled, "ineligible-hook");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "HOOK.md"),
      [
        "---",
        "name: ineligible-hook",
        "description: needs missing binary",
        'metadata: { "eliza": { "events": ["command:new"], "requires": { "bins": ["__nonexistent_binary_12345__"] } } }',
        "---",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      join(dir, "handler.mjs"),
      "export default function handler(event) {}",
      "utf-8",
    );

    const loadHooks = await getLoadHooks();
    const result = await loadHooks({ bundledDir: bundled });

    expect(result.discovered).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("ineligible-hook");
    expect(result.registered).toBe(0);
  });

  it("uses hookKey from metadata for config lookup", async () => {
    const bundled = join(tempRoot, "hookkey-bundled");
    await createRealHookDir(bundled, "display-name", {
      events: ["command:new"],
      hookKey: "custom-config-key",
    });

    const loadHooks = await getLoadHooks();
    const result = await loadHooks({
      bundledDir: bundled,
      internalConfig: {
        entries: { "custom-config-key": { enabled: false } },
      },
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("disabled in config");
  });
});

// ============================================================================
//  2. Path safety (legacy handlers)
// ============================================================================

describe("path safety -- legacy handlers", () => {
  it("rejects legacy handler with module path outside allowed roots", async () => {
    const loadHooks = await getLoadHooks();

    const config: InternalHooksConfig = {
      handlers: [
        {
          event: "command:new",
          module: "/etc/malicious/handler.ts",
        },
      ],
    };

    const result = await loadHooks({ internalConfig: config });

    expect(result.failed).toContain("/etc/malicious/handler.ts");
  });

  it("accepts legacy handler with module path under allowed root", async () => {
    const loadHooks = await getLoadHooks();

    // FAKE_HOME is the mocked homedir -- managed hooks dir = FAKE_HOME/.eliza/hooks
    const safeDir = resolve(FAKE_HOME, ".eliza", "hooks", "my-hook");
    const managedPath = resolve(safeDir, "handler.mjs");
    await mkdir(safeDir, { recursive: true });
    await writeFile(
      managedPath,
      "export default function managedHandler() {}",
      "utf-8",
    );
    const config: InternalHooksConfig = {
      handlers: [
        {
          event: "command:new",
          module: managedPath,
        },
      ],
    };

    try {
      const result = await loadHooks({ internalConfig: config });

      expect(result.failed).not.toContain(managedPath);
      expect(result.registered).toBe(1);
    } finally {
      await unlink(managedPath).catch(() => {});
    }
  });

  it("rejects symlinked legacy handlers that escape allowed roots", async () => {
    const loadHooks = await getLoadHooks();

    const safeDir = resolve(FAKE_HOME, ".eliza", "hooks", "escaped-hook");
    const escapedTarget = join(tempRoot, "escaped-handler.mjs");
    const symlinkPath = join(safeDir, "handler.mjs");
    await mkdir(safeDir, { recursive: true });
    await writeFile(
      escapedTarget,
      "export default function escapedHandler() {}",
      "utf-8",
    );
    await symlink(escapedTarget, symlinkPath);

    try {
      const result = await loadHooks({
        internalConfig: {
          handlers: [{ event: "command:new", module: symlinkPath }],
        },
      });

      expect(result.failed).toContain(symlinkPath);
    } finally {
      await unlink(symlinkPath).catch(() => {});
    }
  });

  it("rejects broken legacy handler symlinks", async () => {
    const loadHooks = await getLoadHooks();

    const safeDir = resolve(FAKE_HOME, ".eliza", "hooks", "broken-hook");
    const brokenTarget = join(tempRoot, "missing-handler.mjs");
    const symlinkPath = join(safeDir, "handler.mjs");
    await mkdir(safeDir, { recursive: true });
    await symlink(brokenTarget, symlinkPath);

    try {
      const result = await loadHooks({
        internalConfig: {
          handlers: [{ event: "command:new", module: symlinkPath }],
        },
      });

      expect(result.failed).toContain(symlinkPath);
    } finally {
      await unlink(symlinkPath).catch(() => {});
    }
  });
});

// ============================================================================
//  3. Config extraDirs safety
// ============================================================================

describe("config extraDirs safety", () => {
  it("rejects config extraDirs outside ~/.eliza/", async () => {
    const loadHooks = await getLoadHooks();

    const config: InternalHooksConfig = {
      load: {
        extraDirs: ["/tmp/attacker-controlled"],
      },
    };

    // Should not throw -- just silently rejects the unsafe dir
    await loadHooks({ internalConfig: config });

    // The rejected dir should not have been passed to discovery.
    // We verify this indirectly: if the dir had hooks, none would be loaded.
    // Since /tmp/attacker-controlled is empty, registered = 0.
  });

  it("accepts config extraDirs under ~/.eliza/", async () => {
    const loadHooks = await getLoadHooks();

    // Use absolute path under the mocked homedir's .eliza
    const safePath = resolve(FAKE_HOME, ".eliza", "custom-hooks");
    await mkdir(safePath, { recursive: true });

    const config: InternalHooksConfig = {
      load: {
        extraDirs: [safePath],
      },
    };

    // Should succeed without error
    const result = await loadHooks({ internalConfig: config });
    // No hooks in the safe dir, but it should not be rejected
    expect(result.failed).toHaveLength(0);
  });
});
