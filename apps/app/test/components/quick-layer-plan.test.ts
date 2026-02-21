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
});
