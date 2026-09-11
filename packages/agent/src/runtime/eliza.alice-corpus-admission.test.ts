import { AgentRuntime, type Plugin } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAliceCorpusPlugin } from "../plugins/alice-corpus/index.js";

function createRuntime(plugins: Plugin[]): AgentRuntime {
  return new AgentRuntime({
    plugins,
    disableBasicCapabilities: true,
    enableDocuments: true,
    enableRelationships: false,
    enableTrajectories: false,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Alice corpus production runtime admission", () => {
  it("rejects runtime initialization when strict corpus admission fails", async () => {
    vi.stubEnv(
      "ALICE_CORPUS_ROOT",
      `/definitely-missing/alice-corpus-${Date.now()}`,
    );
    vi.stubEnv("ALICE_CORPUS_PROJECTION", "internal");
    vi.stubEnv("ALICE_CORPUS_VERIFY", "selected");
    vi.stubEnv("ALICE_CORPUS_STRICT", "1");
    vi.stubEnv("ALICE_CORPUS_GRAPH_ENABLED", "0");
    vi.stubEnv("ALICE_CORPUS_ALLOW_OWNER_PRIVATE", "0");

    const runtime = createRuntime([createAliceCorpusPlugin()]);

    await expect(
      runtime.initialize({
        allowNoDatabase: true,
        skipMigrations: true,
      }),
    ).rejects.toThrow();

    expect(runtime.messageService).toBeNull();
  });

  it("awaits a regular corpus plugin init before the runtime becomes ready", async () => {
    let releaseSeed: (() => void) | undefined;
    let seedStarted = false;
    let initializationSettled = false;
    const seedGate = new Promise<void>((resolve) => {
      releaseSeed = resolve;
    });

    const slowCorpusPlugin: Plugin = {
      name: "alice-corpus-awaited-admission-fixture",
      description: "Proves regular plugin initialization is awaited.",
      init: async () => {
        seedStarted = true;
        await seedGate;
      },
    };
    const runtime = createRuntime([slowCorpusPlugin]);

    const initialization = runtime
      .initialize({
        allowNoDatabase: true,
        skipMigrations: true,
      })
      .then(() => {
        initializationSettled = true;
      });

    await vi.waitFor(() => {
      expect(seedStarted).toBe(true);
    });
    expect(initializationSettled).toBe(false);
    expect(runtime.messageService).toBeNull();

    releaseSeed?.();
    await initialization;

    expect(initializationSettled).toBe(true);
    expect(runtime.messageService).not.toBeNull();

    await runtime.stop({ fast: true });
  });
});
