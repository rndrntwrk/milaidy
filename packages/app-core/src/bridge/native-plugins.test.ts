import { describe, expect, it } from "vitest";

import { getAppBlockerPlugin } from "./native-plugins";

describe("native plugin bridge", () => {
  it("exposes the AppBlocker getter required by LifeOps runtime imports", () => {
    expect(getAppBlockerPlugin()).toEqual({});
  });
});
