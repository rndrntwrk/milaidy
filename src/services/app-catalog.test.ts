import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeManagedAppConfiguredUrl,
  resolveAppFallbackEnvKey,
  resolveAppStreamEnvKey,
  resolveAppUpstreamEnvKey,
  resolveManagedAppFallbackUrl,
  resolveManagedAppStreamUrl,
  resolveManagedAppUpstreamUrl,
} from "./app-catalog";

const HYPERSCAPE_APP = "@elizaos/app-hyperscape";
const HYPERSCAPE_LIVE_URL = "https://hyperscape.gg/";

function envSnapshot(keys: string[]): {
  restore: () => void;
} {
  const saved = new Map<string, string | undefined>();
  for (const key of keys) {
    saved.set(key, process.env[key]);
  }
  return {
    restore() {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

describe("app-catalog managed URLs", () => {
  const streamKey = resolveAppStreamEnvKey(HYPERSCAPE_APP);
  const fallbackKey = resolveAppFallbackEnvKey(HYPERSCAPE_APP);
  const upstreamKey = resolveAppUpstreamEnvKey(HYPERSCAPE_APP);
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    const snapshot = envSnapshot([streamKey, fallbackKey, upstreamKey]);
    restoreEnv = snapshot.restore;
    delete process.env[streamKey];
    delete process.env[fallbackKey];
    delete process.env[upstreamKey];
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
  });

  it("normalizes legacy hyperscape downloads URL to the live game URL", () => {
    const normalized = normalizeManagedAppConfiguredUrl(
      HYPERSCAPE_APP,
      "https://hyperscapeai.github.io/hyperscape/",
    );
    expect(normalized).toBe(HYPERSCAPE_LIVE_URL);
  });

  it("normalizes legacy stream env values at read time", () => {
    process.env[streamKey] = "https://hyperscapeai.github.io/hyperscape";
    expect(resolveManagedAppStreamUrl(HYPERSCAPE_APP)).toBe(HYPERSCAPE_LIVE_URL);
  });

  it("defaults hyperscape fallback URL to the live game URL", () => {
    expect(resolveManagedAppFallbackUrl(HYPERSCAPE_APP)).toBe(HYPERSCAPE_LIVE_URL);
  });

  it("normalizes legacy upstream env values at read time", () => {
    process.env[upstreamKey] = "https://hyperscapeai.github.io/hyperscape/";
    expect(resolveManagedAppUpstreamUrl(HYPERSCAPE_APP)).toBe(HYPERSCAPE_LIVE_URL);
  });
});
