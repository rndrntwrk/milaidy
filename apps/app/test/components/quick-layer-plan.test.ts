import { describe, expect, it } from "vitest";
import {
  didToolActionSucceed,
  findLastToolEnvelope,
  getToolActionFailureMessage,
} from "../../src/components/quickLayerPlan.js";

function pipelineResult(payload: Record<string, unknown>): unknown {
  return {
    result: {
      text: JSON.stringify(payload),
    },
  };
}

function structuredPipelineResult(
  toolName: string,
  {
    success,
    error,
    text,
    data,
  }: {
    success?: boolean;
    error?: string;
    text?: string;
    data?: Record<string, unknown>;
  },
): unknown {
  return {
    toolName,
    ...(typeof success === "boolean" ? { success } : {}),
    ...(typeof error === "string" ? { error } : {}),
    result: {
      ...(typeof success === "boolean" ? { success } : {}),
      ...(typeof error === "string" ? { error } : {}),
      ...(typeof text === "string" ? { text } : {}),
      ...(data ? { data } : {}),
    },
  };
}

describe("quickLayerPlan helpers", () => {
  it("finds the last matching action envelope", () => {
    const results = [
      pipelineResult({
        action: "STREAM555_GO_LIVE",
        ok: true,
        message: "first",
      }),
      pipelineResult({
        action: "STREAM555_GO_LIVE",
        ok: false,
        message: "latest",
      }),
    ];

    const envelope = findLastToolEnvelope(results, "stream555_go_live");
    expect(envelope?.ok).toBe(false);
    expect(envelope?.message).toBe("latest");
  });

  it("prefers explicit envelope success over aggregate plan flags", () => {
    const plan = {
      allSucceeded: false,
      results: [
        pipelineResult({
          action: "STREAM555_SCREEN_SHARE",
          ok: true,
        }),
      ],
    };

    expect(didToolActionSucceed(plan, "STREAM555_SCREEN_SHARE")).toBe(true);
  });

  it("prefers explicit envelope failure over aggregate plan flags", () => {
    const plan = {
      allSucceeded: true,
      results: [
        pipelineResult({
          action: "STREAM555_END_LIVE",
          ok: false,
        }),
      ],
    };

    expect(didToolActionSucceed(plan, "STREAM555_END_LIVE")).toBe(false);
  });

  it("falls back to allSucceeded when envelope is unavailable", () => {
    expect(
      didToolActionSucceed({ allSucceeded: true, results: [] }, "STREAM555_RADIO_CONTROL"),
    ).toBe(true);
    expect(
      didToolActionSucceed({ allSucceeded: false, results: [] }, "STREAM555_RADIO_CONTROL"),
    ).toBe(false);
  });

  it("recognizes structured plan-step success without JSON text envelopes", () => {
    const plan = {
      allSucceeded: false,
      results: [
        structuredPipelineResult("STREAM555_GO_LIVE", {
          success: true,
          text: "Legacy go-live started for session test-session.",
          data: { status: "created" },
        }),
        structuredPipelineResult("STREAM555_GO_LIVE_SEGMENTS", {
          success: false,
          error: "STREAM555_GO_LIVE_SEGMENTS failed: Stream already active",
          text: "STREAM555_GO_LIVE_SEGMENTS failed: Stream already active",
        }),
      ],
    };

    expect(didToolActionSucceed(plan, "STREAM555_GO_LIVE")).toBe(true);
    expect(didToolActionSucceed(plan, "STREAM555_GO_LIVE_SEGMENTS")).toBe(false);
  });

  it("extracts a useful failure message when available", () => {
    const plan = {
      allSucceeded: false,
      results: [
        pipelineResult({
          action: "STREAM555_AD_TRIGGER",
          ok: false,
          message: "ad inventory exhausted",
        }),
      ],
    };

    expect(
      getToolActionFailureMessage(
        plan,
        "STREAM555_AD_TRIGGER",
        "ad trigger failed",
      ),
    ).toBe("ad inventory exhausted");
    expect(
      getToolActionFailureMessage(
        { allSucceeded: false, results: [] },
        "STREAM555_AD_TRIGGER",
        "ad trigger failed",
      ),
    ).toBe("ad trigger failed");
  });

  it("extracts failure messages from structured plan results", () => {
    const plan = {
      allSucceeded: false,
      results: [
        structuredPipelineResult("STREAM555_GO_LIVE_SEGMENTS", {
          success: false,
          error: "STREAM555_GO_LIVE_SEGMENTS failed: Stream already active",
          text: "STREAM555_GO_LIVE_SEGMENTS failed: Stream already active",
        }),
      ],
    };

    expect(
      getToolActionFailureMessage(
        plan,
        "STREAM555_GO_LIVE_SEGMENTS",
        "segment bootstrap failed",
      ),
    ).toBe("STREAM555_GO_LIVE_SEGMENTS failed: Stream already active");
  });
});
