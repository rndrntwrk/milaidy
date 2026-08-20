import { beforeEach, describe, expect, it } from "vitest";
import { setBootConfig } from "@miladyai/app-core/config";
import { getVrmUrl } from "@miladyai/app-core/state";

const ALICE_EDGE_VRM =
  "https://assets.rndrntwrk.com/alice/vrms/milady-9-ccbe2ea31713e33d08c1d0cd6be3aab6c90155ff6488ce2d9bc23e86d5d66ac2.vrm.gz";

beforeEach(() => {
  setBootConfig({
    branding: {},
    vrmAssets: Array.from({ length: 9 }, (_, index) => ({
      title: index === 8 ? "Alice" : `Milady ${index + 1}`,
      slug: `milady-${index + 1}`,
      ...(index === 8 ? { vrmUrl: ALICE_EDGE_VRM } : {}),
    })),
  });
});

describe("Alice VRM edge delivery", () => {
  it("resolves milady-9 to the immutable Cloudflare asset", () => {
    expect(getVrmUrl(9)).toBe(ALICE_EDGE_VRM);
  });

  it("keeps other bundled avatars on the configured app asset origin", () => {
    expect(getVrmUrl(1)).toBe("/vrms/milady-1.vrm.gz");
  });
});
