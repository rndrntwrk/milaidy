import { describe, expect, it, vi } from "vitest";

/**
 * Validates that MJPEG subscriber cleanup doesn't modify the Set
 * during iteration — collects failures first, then deletes.
 */
describe("MJPEG subscriber cleanup pattern", () => {
  it("collects failed subscribers before deleting from Set", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "stream-routes.ts"),
      "utf-8",
    );

    // Find pushFrameToSubscribers function
    const fnIdx = source.indexOf("pushFrameToSubscribers");
    expect(fnIdx).toBeGreaterThan(-1);

    // Extract the function body (next ~600 chars)
    const fnBody = source.slice(fnIdx, fnIdx + 600);

    // Verify the pattern: collect in array, then delete after loop
    expect(fnBody).toContain("failed.push(sub)");
    expect(fnBody).toContain("for (const sub of failed)");

    // Verify there's NO delete inside the iteration loop
    const iterStart = fnBody.indexOf("for (const sub of mjpegSubscribers)");
    const iterEnd = fnBody.indexOf("for (const sub of failed)");
    expect(iterStart).toBeGreaterThan(-1);
    expect(iterEnd).toBeGreaterThan(iterStart);
    const iterBody = fnBody.slice(iterStart, iterEnd);
    expect(iterBody).not.toContain("mjpegSubscribers.delete");
  });
});


vi.mock("@elizaos/core", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { handleStreamRoute } from "./stream-routes";
import type { StreamRouteState } from "./stream-route-state";
import { createMockHttpResponse, createMockIncomingMessage } from "../test-support/test-helpers";

function nativeSetupState(service: object | null): StreamRouteState {
  return {
    destinations: new Map(), activeStreamSource: { type: 'stream-tab' },
    runtime: { getService: () => service },
    streamManager: {
      isRunning: vi.fn(() => false), writeFrame: vi.fn(() => false), start: vi.fn(async () => {}),
      stop: vi.fn(async () => ({ uptime: 0 })),
      getHealth: vi.fn(() => ({ running: false, ffmpegAlive: false, uptime: 0, frameCount: 0,
        volume: 1, muted: false, audioSource: 'none', inputMode: null })),
      getVolume: vi.fn(() => 1), isMuted: vi.fn(() => false), setVolume: vi.fn(async () => {}),
      mute: vi.fn(async () => {}), unmute: vi.fn(async () => {}),
    },
  };
}

describe('native shared setup route', () => {
  it('retains native capture lifecycle on owner status reads without claiming FFmpeg delivery', async () => {
    const originalMode = process.env.ALICE_RUNTIME_AUTHORITY_MODE;
    const originalProfile = process.env.ALICE_RUNTIME_PROFILE;
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = 'proposer-only';
    process.env.ALICE_RUNTIME_PROFILE = 'full-gated';
    try {
      const service = { getConfig: () => ({ defaultSessionId: 'alice-session' }),
        startStream: vi.fn(), stopStream: vi.fn(),
        getStreamStatus: vi.fn(async () => ({ sessionId: 'alice-session', active: true, status: 'live', platforms: {} })) };
      const { res, getStatus, getJson } = createMockHttpResponse();
      await handleStreamRoute(createMockIncomingMessage({}), res, '/api/stream/status', 'GET', nativeSetupState(service));
      expect(getStatus()).toBe(200);
      expect(getJson()).toMatchObject({ nativeCaptureStatus: 'live', running: true, ffmpegAlive: false });
      expect(service.startStream).not.toHaveBeenCalled();
      expect(service.stopStream).not.toHaveBeenCalled();
    } finally {
      if (originalMode === undefined) delete process.env.ALICE_RUNTIME_AUTHORITY_MODE;
      else process.env.ALICE_RUNTIME_AUTHORITY_MODE = originalMode;
      if (originalProfile === undefined) delete process.env.ALICE_RUNTIME_PROFILE;
      else process.env.ALICE_RUNTIME_PROFILE = originalProfile;
    }
  });
  it('dispatches the configured native read without starting, binding, or local fallback', async () => {
    const saved = { sessionId: 'alice-session', revision: 3, studioUrl: 'https://stream.rndrntwrk.com/studio?sessionId=alice-session',
      aspectRatio: '16:9', activeLayout: 'pip', pipPosition: 'bottom-right', overlay: { enabled: true, mode: 'filter' }, sources: [], destinations: [], active: true };
    const service = { getNativeSetup: vi.fn(async () => saved), getConfig: () => ({ defaultSessionId: 'alice-session' }),
      getStreamStatus: vi.fn(), startStream: vi.fn(), stopStream: vi.fn(), bindWebSocket: vi.fn(), createOrResumeSession: vi.fn() };
    const state = nativeSetupState(service);
    const { res, getStatus, getJson } = createMockHttpResponse();
    expect(await handleStreamRoute(createMockIncomingMessage({}), res, '/api/stream/native-setup', 'GET', state)).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(saved);
    expect(service.getNativeSetup).toHaveBeenCalledTimes(1);
    expect(service.getStreamStatus).not.toHaveBeenCalled();
    expect(service.startStream).not.toHaveBeenCalled();
    expect(service.bindWebSocket).not.toHaveBeenCalled();
    expect(service.createOrResumeSession).not.toHaveBeenCalled();
    expect(state.streamManager.getHealth).not.toHaveBeenCalled();
  });
  it('fails visibly for missing native authority or denied admission without local fallback', async () => {
    const missing = createMockHttpResponse();
    await handleStreamRoute(createMockIncomingMessage({}), missing.res, '/api/stream/native-setup', 'GET', nativeSetupState(null));
    expect(missing.getStatus()).toBe(503);
    const service = { getNativeSetup: vi.fn(async () => { throw new Error('private upstream denial'); }),
      getConfig: () => ({ defaultSessionId: 'alice-session' }), getStreamStatus: vi.fn(), startStream: vi.fn(), stopStream: vi.fn() };
    const state = nativeSetupState(service), denied = createMockHttpResponse();
    await handleStreamRoute(createMockIncomingMessage({}), denied.res, '/api/stream/native-setup', 'GET', state);
    expect(denied.getStatus()).toBe(502);
    expect(JSON.stringify(denied.getJson())).not.toContain('private upstream denial');
    expect(state.streamManager.getHealth).not.toHaveBeenCalled();
  });
});
