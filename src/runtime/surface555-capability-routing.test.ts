import { describe, expect, it } from "vitest";
import { createSurface555CapabilityPolicy } from "./surface555-capability-policy.js";
import {
  resolveSurface555CapabilityForAction,
  resolveSurface555CapabilityForRequest,
} from "./surface555-capability-routing.js";

describe("resolveSurface555CapabilityForRequest", () => {
  it("maps battle create routes to battles.create", () => {
    expect(
      resolveSurface555CapabilityForRequest("POST", "/api/battles/create"),
    ).toBe("battles.create");
    expect(
      resolveSurface555CapabilityForRequest("POST", "/api/battle/create"),
    ).toBe("battles.create");
  });

  it("maps battle resolve routes to battles.resolve", () => {
    expect(
      resolveSurface555CapabilityForRequest("POST", "/api/battles/resolve"),
    ).toBe("battles.resolve");
  });

  it("maps battle reads to battles.read", () => {
    expect(resolveSurface555CapabilityForRequest("GET", "/api/battles")).toBe(
      "battles.read",
    );
  });
});

describe("resolveSurface555CapabilityForAction", () => {
  it("maps challenge/create battle actions to battles.create", () => {
    expect(
      resolveSurface555CapabilityForAction(
        "FIVE55_BATTLES_CREATE",
        "create challenge duel",
      ),
    ).toBe("battles.create");
  });

  it("maps resolve battle actions to battles.resolve", () => {
    expect(
      resolveSurface555CapabilityForAction(
        "FIVE55_BATTLES_RESOLVE",
        "resolve battle",
      ),
    ).toBe("battles.resolve");
  });
});

describe("createSurface555CapabilityPolicy", () => {
  it("grants battles.create by default", () => {
    const policy = createSurface555CapabilityPolicy();
    expect(policy.can("battles.create")).toBe(true);
  });
});
