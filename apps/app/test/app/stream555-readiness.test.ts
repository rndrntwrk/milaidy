import { describe, expect, it } from "vitest";

import { buildStream555StatusSummary } from "../../src/stream555Readiness";

type ParamInput = {
  key: string;
  currentValue?: string | null;
  default?: string | null;
  isSet?: boolean;
};

function makeParam(param: ParamInput) {
  return {
    key: param.key,
    type: "string" as const,
    required: false,
    sensitive: false,
    currentValue: null,
    default: null,
    isSet: false,
    ...param,
  };
}

describe("stream555 readiness", () => {
  it("treats built-in RTMP defaults as url-ready for first-party destinations", () => {
    const summary = buildStream555StatusSummary([
      makeParam({
        key: "STREAM555_DEST_TWITCH_ENABLED",
        currentValue: "true",
        isSet: true,
      }),
      makeParam({
        key: "STREAM555_DEST_TWITCH_RTMP_URL",
        currentValue: "rtmps://ingest.global-contribute.live-video.net/app",
        default: "rtmps://ingest.global-contribute.live-video.net/app",
        isSet: false,
      }),
      makeParam({
        key: "STREAM555_DEST_TWITCH_STREAM_KEY",
        currentValue: "••••1234",
        isSet: true,
      }),
    ]);

    const twitch = summary.destinations.find((destination) => destination.id === "twitch");

    expect(summary.readyDestinations).toBe(1);
    expect(twitch).toMatchObject({
      id: "twitch",
      urlSet: false,
      urlReady: true,
      readinessState: "ready",
    });
  });

  it("requires both URL and stream key for custom RTMP readiness", () => {
    const summary = buildStream555StatusSummary([
      makeParam({
        key: "STREAM555_DEST_CUSTOM_ENABLED",
        currentValue: "true",
        isSet: true,
      }),
      makeParam({
        key: "STREAM555_DEST_CUSTOM_STREAM_KEY",
        currentValue: "••••4321",
        isSet: true,
      }),
    ]);

    const custom = summary.destinations.find((destination) => destination.id === "custom");

    expect(summary.readyDestinations).toBe(0);
    expect(custom).toMatchObject({
      urlReady: false,
      readinessState: "missing-url",
    });
  });

  it("merges runtime diagnostics from the active plugin", () => {
    const summary = buildStream555StatusSummary(
      [
        makeParam({
          key: "STREAM555_DEST_TWITCH_ENABLED",
          currentValue: "true",
          isSet: true,
        }),
        makeParam({
          key: "STREAM555_DEST_TWITCH_STREAM_KEY",
          currentValue: "••••1234",
          isSet: true,
        }),
      ],
      {
        isActive: true,
        authenticated: false,
        ready: false,
        operationalWarnings: ["one or more enabled channels are missing RTMP URL or stream key"],
        operationalErrors: ["agent websocket error: Unexpected server response: 404"],
        operationalCounts: {
          wsConnected: 0,
          sessionBound: 0,
        },
      },
    );

    expect(summary.runtimeLoaded).toBe(true);
    expect(summary.wsConnected).toBe(false);
    expect(summary.runtimeHealth).toBe("blocked");
    expect(summary.lastRuntimeError).toContain("404");
    expect(summary.runtimeBlockers).toContain(
      "agent websocket error: Unexpected server response: 404",
    );
  });
});
