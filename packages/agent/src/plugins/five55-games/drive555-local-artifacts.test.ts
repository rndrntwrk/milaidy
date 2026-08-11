import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  DRIVE555_APPROVED_CONTROLLER_TRUST_PINS,
  DRIVE555_APPROVED_NATIVE_TRUST_PINS,
  DRIVE555_NATIVE_SOURCE_ANCHOR_FILE_SHA256_BY_REPO_PATH_V1,
  DRIVE555_NATIVE_SOURCE_ANCHOR_SET_V1,
} from "./drive555-local-artifacts.js";

describe("555Drive local artifact trust pins", () => {
  it("freezes the corrected Arcade controller artifact triple", () => {
    expect(DRIVE555_APPROVED_CONTROLLER_TRUST_PINS).toEqual({
      artifactDigest: "30c6037daf09286f7d2c3171257b8786514c77c537be47a0845461575183b22e",
      manifestSha256: "53780dacb0632bb53a7b953ca76714499bf2bb8d9b7a1e1379dae08fe495e3b8",
      runtimeSha256: "583add96f83945c3ee56d18cbc760dec6cca5647ee70548305e6c0dc577c316a",
    });
  });

  it("binds the native anchor digest to the canonical sorted repo-path hash map", () => {
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
    expect(DRIVE555_NATIVE_SOURCE_ANCHOR_FILE_SHA256_BY_REPO_PATH_V1).toEqual({
      "apps/web/public/games/555drive/agent-bridge.js":
        "00c4b608bd2de966e4da6f3904b555639be9ab8261af679f9c5c2c7aa648af49",
      "apps/web/public/games/555drive/code/game.js":
        "8105e964ff6e318c12499bcc44b3d4f07dcfc68fcec1a3f22be03ac629b519f3",
      "apps/web/public/games/555drive/code/vehicle.js":
        "f0fd83407546a7bac05566d8b2b3eb355107bedae6402187bd0a71168a207767",
      "apps/web/public/games/555drive/index.html":
        "536dbb9bed90162d3d9d52b9c66eb0d4b765f6e6736277ded55541d113ea4c10",
    });

    const canonicalAnchorMap = JSON.stringify(
      Object.fromEntries(
        Object.entries(DRIVE555_NATIVE_SOURCE_ANCHOR_FILE_SHA256_BY_REPO_PATH_V1).sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
    );
    expect(createHash("sha256").update(canonicalAnchorMap).digest("hex")).toBe(
      DRIVE555_APPROVED_NATIVE_TRUST_PINS.sourceAnchorDigest,
    );
  });
});
