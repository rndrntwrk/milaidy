import { describe, expect, it } from "vitest";
import { resolveChatSidebarWidgets } from "./registry";

describe("resolveChatSidebarWidgets", () => {
  it("falls back to default-enabled plugin widgets before plugin state loads", () => {
    expect(resolveChatSidebarWidgets([]).map((widget) => widget.id)).toEqual([
      "todo.items",
      "lifeops.google",
      "agent-orchestrator.tasks",
      "agent-orchestrator.activity",
    ]);
  });

  it("filters widgets by enabled plugin state", () => {
    expect(
      resolveChatSidebarWidgets([
        { id: "lifeops", enabled: false, isActive: false },
        { id: "todo", enabled: false, isActive: false },
        { id: "agent-orchestrator", enabled: true, isActive: true },
      ]).map((widget) => widget.id),
    ).toEqual(["agent-orchestrator.tasks", "agent-orchestrator.activity"]);
  });
});
