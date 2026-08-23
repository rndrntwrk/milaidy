import { describe, expect, test } from "bun:test";

import {
  authorityDurableName,
  parseSessionDurableName,
  sessionDurableName,
} from "../src/durable-names";

const releaseOne = `sha256:${"1".repeat(64)}`;
const releaseTwo = `sha256:${"2".repeat(64)}`;

describe("release-versioned Durable Object names", () => {
  test("keeps emergency controls and budget global while sessions stay release-scoped", () => {
    expect(authorityDurableName()).toBe("authority/global-safety-v1");
    expect(sessionDurableName("session-canary", releaseOne)).not.toBe(
      sessionDurableName("session-canary", releaseTwo),
    );
  });

  test("round-trips the canonical session id and exact release", () => {
    const name = sessionDurableName("session-canary", releaseOne);
    expect(parseSessionDurableName(name)).toEqual({
      sessionId: "session-canary",
      releaseDigest: releaseOne,
    });
  });

  test("rejects malformed names and identifiers", () => {
    expect(() => sessionDurableName("x", releaseOne)).toThrow(
      "SESSION_DURABLE_NAME_INVALID",
    );
    expect(() => parseSessionDurableName("session-canary")).toThrow(
      "SESSION_DURABLE_NAME_INVALID",
    );
  });
});
