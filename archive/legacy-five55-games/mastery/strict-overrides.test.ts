import { describe, expect, it } from "vitest";
import { getMasteryContract } from "./registry.js";

describe("mastery strict overrides", () => {
  it("uses explicit runtime-native chesspursuit progression gates", () => {
    const contract = getMasteryContract("chesspursuit");
    const gateIds = contract.gateV2.runtimeGates.map((gate) => gate.id);
    expect(gateIds).toContain("chesspursuit-progress-row");
    expect(gateIds).toContain("chesspursuit-checkpoints");
  });

  it("binds playback level requirement to room transition metric", () => {
    const contract = getMasteryContract("playback");
    expect(contract.gateV2.levelRequirement?.metric).toBe("roomTransitions.max");
    const runtimeGate = contract.gateV2.runtimeGates.find(
      (gate) => gate.id === "playback-room-transitions-13",
    );
    expect(runtimeGate?.metric).toBe("roomTransitions.max");
    expect(runtimeGate?.threshold).toBe(13);
  });

  it("requires fighter survival + score thresholds in strict runtime gates", () => {
    const contract = getMasteryContract("fighter-planes");
    const gateIds = contract.gateV2.runtimeGates.map((gate) => gate.id);
    expect(gateIds).toContain("fighter-survival-60s");
    expect(gateIds).toContain("fighter-score-250");
  });
});
