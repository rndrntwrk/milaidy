import { describe, expect, it } from "vitest";
import {
  CANONICAL_MASTERY_GAME_IDS,
  canonicalizeMasteryGameId,
  getMasteryContract,
  listMasteryContracts,
  resolveMasteryGameOrder,
} from "./index.js";

describe("five55 mastery registry", () => {
  it("canonicalizes known aliases", () => {
    expect(canonicalizeMasteryGameId("ninja-vs-evilcorp")).toBe("ninja");
    expect(canonicalizeMasteryGameId("fighterplanes")).toBe("fighter-planes");
    expect(canonicalizeMasteryGameId("roads")).toBe(
      "where-were-going-we-do-need-roads",
    );
  });

  it("rejects unknown game ids", () => {
    expect(() => canonicalizeMasteryGameId("pixel-copter")).toThrow(
      /Unknown mastery gameId/,
    );
  });

  it("provides a contract for all canonical mastery games", () => {
    const contracts = listMasteryContracts();
    expect(contracts).toHaveLength(CANONICAL_MASTERY_GAME_IDS.length);

    for (const gameId of CANONICAL_MASTERY_GAME_IDS) {
      const contract = getMasteryContract(gameId);
      expect(contract.gameId).toBe(gameId);
      expect(contract.objective.summary.length).toBeGreaterThan(10);
      expect(contract.controls.length).toBeGreaterThan(0);
      expect(contract.passGates.length).toBeGreaterThan(0);
      expect(contract.policy.family.length).toBeGreaterThan(0);
    }
  });

  it("preserves order while deduplicating requested game set", () => {
    const ordered = resolveMasteryGameOrder([
      "ninja-vs-evilcorp",
      "ninja",
      "knighthood",
    ]);
    expect(ordered).toEqual(["ninja", "knighthood"]);
  });
});
