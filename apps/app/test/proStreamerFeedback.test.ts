import { describe, expect, it, vi } from "vitest";

import { routeProStreamerFeedback } from "../src/proStreamerFeedback.js";

function makeSinks() {
  return {
    showToast: vi.fn(),
    showGoLiveInline: vi.fn(),
    showActionLogInline: vi.fn(),
    showModal: vi.fn(),
    openActionLog: vi.fn(),
  };
}

describe("routeProStreamerFeedback", () => {
  it("routes toast feedback without touching persistent surfaces", () => {
    const sinks = makeSinks();

    const target = routeProStreamerFeedback(
      {
        target: "toast",
        tone: "success",
        message: "Ad created and triggered.",
        ttlMs: 2800,
      },
      sinks,
    );

    expect(target).toBe("toast");
    expect(sinks.showToast).toHaveBeenCalledTimes(1);
    expect(sinks.showGoLiveInline).not.toHaveBeenCalled();
    expect(sinks.showActionLogInline).not.toHaveBeenCalled();
    expect(sinks.openActionLog).not.toHaveBeenCalled();
  });

  it("routes blocked launch feedback to the Go Live inline surface only", () => {
    const sinks = makeSinks();

    const target = routeProStreamerFeedback(
      {
        target: "go-live-inline",
        tone: "warning",
        message: "Selected channels are no longer ready.",
      },
      sinks,
    );

    expect(target).toBe("go-live-inline");
    expect(sinks.showGoLiveInline).toHaveBeenCalledTimes(1);
    expect(sinks.showToast).not.toHaveBeenCalled();
    expect(sinks.showActionLogInline).not.toHaveBeenCalled();
    expect(sinks.openActionLog).not.toHaveBeenCalled();
  });

  it("routes actionable quick-layer failures to the Action Log and auto-opens it", () => {
    const sinks = makeSinks();

    const target = routeProStreamerFeedback(
      {
        target: "action-log-inline",
        tone: "error",
        title: "Screen Share",
        message: "Screen-share request failed: runtime refused scene attach.",
        actionLabel: "Review live controls",
      },
      sinks,
    );

    expect(target).toBe("action-log-inline");
    expect(sinks.showActionLogInline).toHaveBeenCalledTimes(1);
    expect(sinks.openActionLog).toHaveBeenCalledTimes(1);
    expect(sinks.showToast).not.toHaveBeenCalled();
    expect(sinks.showGoLiveInline).not.toHaveBeenCalled();
  });
});
