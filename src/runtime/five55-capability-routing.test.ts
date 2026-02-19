import { describe, expect, it } from "vitest";
import { createFive55CapabilityPolicy } from "./five55-capability-policy.js";
import {
  resolveFive55CapabilityForAction,
  resolveFive55CapabilityForRequest,
} from "./five55-capability-routing.js";

describe("resolveFive55CapabilityForRequest", () => {
  it("maps battle create routes to battles.create", () => {
    expect(
      resolveFive55CapabilityForRequest("POST", "/api/battles/create"),
    ).toBe("battles.create");
    expect(
      resolveFive55CapabilityForRequest("POST", "/api/battle/create"),
    ).toBe("battles.create");
  });

  it("maps battle resolve routes to battles.resolve", () => {
    expect(
      resolveFive55CapabilityForRequest("POST", "/api/battles/resolve"),
    ).toBe("battles.resolve");
  });

  it("maps battle reads to battles.read", () => {
    expect(resolveFive55CapabilityForRequest("GET", "/api/battles")).toBe(
      "battles.read",
    );
  });
});

describe("resolveFive55CapabilityForAction", () => {
  it("maps challenge/create battle actions to battles.create", () => {
    expect(
      resolveFive55CapabilityForAction(
        "FIVE55_BATTLES_CREATE",
        "create challenge duel",
      ),
    ).toBe("battles.create");
  });

  it("maps resolve battle actions to battles.resolve", () => {
    expect(
      resolveFive55CapabilityForAction(
        "FIVE55_BATTLES_RESOLVE",
        "resolve battle",
      ),
    ).toBe("battles.resolve");
  });
});

describe("createFive55CapabilityPolicy", () => {
  it("grants battles.create by default", () => {
    const policy = createFive55CapabilityPolicy();
    expect(policy.can("battles.create")).toBe(true);
  });
});
