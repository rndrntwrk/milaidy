import { describe, expect, it } from "bun:test";
import {
  DRIVE555_APPROVED_NATIVE_TRUST_PINS,
  DRIVE555_NATIVE_SOURCE_ANCHOR_SET_V1,
} from "./drive555-local-artifacts.js";

describe("555Drive local artifact trust pins", () => {
  it("freezes the approved native bridge and documented source-anchor set in code", () => {
    expect(DRIVE555_APPROVED_NATIVE_TRUST_PINS).toEqual({
      bridgeDigest: "00c4b608bd2de966e4da6f3904b555639be9ab8261af679f9c5c2c7aa648af49",
      sourceAnchorDigest: "e666ec633a9ed3877f49627a92c6c56d76dfcc2dd0f37edbc64fc80444119d4f",
    });
    expect(DRIVE555_NATIVE_SOURCE_ANCHOR_SET_V1).toEqual([
      "agent-bridge.js",
      "code/game.js",
      "code/vehicle.js",
      "index.html",
    ]);
  });
});
