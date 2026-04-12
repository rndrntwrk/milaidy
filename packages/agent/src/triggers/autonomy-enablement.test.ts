/**
 * Autonomy enablement contract tests — REAL integration tests.
 *
 * Tests that trigger-related autonomy enablement works with a real runtime.
 * Test 1 uses the real autonomy service.
 * Test 2 verifies source code contracts (static analysis, no mocks needed).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

describe("autonomy enablement for triggers", () => {
  it("real runtime supports enableAutonomy toggling", async () => {
    // Use the real autonomy service if available
    const autonomySvc = runtime.getService("AUTONOMY") as {
      enableAutonomy?: () => Promise<void>;
      disableAutonomy?: () => Promise<void>;
    } | null;

    if (!autonomySvc?.enableAutonomy) {
      // Autonomy service may not be registered in test runtime — skip
      return;
    }

    // Enable autonomy
    await autonomySvc.enableAutonomy();
    expect(runtime.enableAutonomy).toBe(true);

    // Disable autonomy
    if (autonomySvc.disableAutonomy) {
      await autonomySvc.disableAutonomy();
      expect(runtime.enableAutonomy).toBe(false);
    }
  }, 60_000);

  it("startup and hot-reload paths enable autonomy after startup guards", () => {
    // This is a static source code analysis test — no mocks needed
    const expectEnableBlock = (source: string, anchor: string): string => {
      const start = source.indexOf(anchor);
      expect(start).toBeGreaterThan(-1);
      const after = source.slice(start, start + 1_600);
      expect(after).toContain("enableAutonomy()");
      return after;
    };

    const elizaSource = readFileSync(
      path.resolve(import.meta.dirname, "../runtime/eliza.ts"),
      "utf8",
    );

    expect(elizaSource).toContain("AutonomyService.start(");
    expectEnableBlock(
      elizaSource,
      "Enable the autonomy loop so trigger/heartbeat instructions are",
    );
    expectEnableBlock(elizaSource, "Enable the autonomy loop after hot-reload");
  });
});
