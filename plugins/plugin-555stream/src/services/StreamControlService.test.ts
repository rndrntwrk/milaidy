import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { IAgentRuntime } from "../types/index.js";
import { createApprovalRequest } from "../routes/approvals.js";
import { StreamControlService } from "./StreamControlService.js";

const STREAM_ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM_API_BEARER_TOKEN",
  "STREAM555_DEST_PUMPFUN_ENABLED",
  "STREAM555_DEST_PUMPFUN_RTMP_URL",
  "STREAM555_DEST_PUMPFUN_STREAM_KEY",
  "STREAM555_DEST_X_ENABLED",
  "STREAM555_DEST_X_RTMP_URL",
  "STREAM555_DEST_X_STREAM_KEY",
] as const;

const ORIGINAL_ENV = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!ORIGINAL_ENV.has(key)) {
    ORIGINAL_ENV.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("StreamControlService", () => {
  beforeEach(() => {
    for (const key of STREAM_ENV_KEYS) {
      setEnv(key, undefined);
    }
  });

  afterEach(() => {
    for (const [key, value] of ORIGINAL_ENV.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    ORIGINAL_ENV.clear();
  });

  it("starts through the runtime service contract and reports channel readiness", async () => {
    setEnv("STREAM555_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");
    setEnv("STREAM555_DEST_PUMPFUN_ENABLED", "true");
    setEnv(
      "STREAM555_DEST_PUMPFUN_RTMP_URL",
      "rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x",
    );
    setEnv("STREAM555_DEST_PUMPFUN_STREAM_KEY", "pump-stream-key");
    setEnv("STREAM555_DEST_X_RTMP_URL", "rtmps://or.pscp.tv:443/x");
    setEnv("STREAM555_DEST_X_STREAM_KEY", "x-stream-key");

    const service = await StreamControlService.start({} as IAgentRuntime);
    const runtimeState = service.getRuntimeState();

    assert.equal(service.serviceType, "stream555");
    assert.equal(runtimeState.loaded, true);
    assert.equal(runtimeState.authenticated, true);
    assert.match(runtimeState.authSource, /static bearer/i);
    assert.equal(runtimeState.channelsSaved, 2);
    assert.equal(runtimeState.channelsEnabled, 1);
    assert.equal(runtimeState.channelsReady, 1);
    assert.deepEqual(runtimeState.errors, []);

    await service.stop();
    assert.equal(service.getRuntimeState().loaded, false);
  });

  it("exposes plugin-owned approval state for host approval APIs", async () => {
    setEnv("STREAM555_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");

    const service = await StreamControlService.start({} as IAgentRuntime);
    const approval = createApprovalRequest("STREAM555_STREAM_STOP", {
      sessionId: "session-1",
    });

    const pending = service.listPendingApprovals();
    assert.equal(pending.some((entry) => entry.id === approval.id), true);

    const resolved = service.resolveApproval(
      approval.id,
      "approved",
      "stream-plugin-test",
    );
    assert.equal(resolved, true);

    const refreshed = service
      .listPendingApprovals()
      .find((entry) => entry.id === approval.id);
    assert.equal(refreshed, undefined);

    await service.stop();
  });
});
