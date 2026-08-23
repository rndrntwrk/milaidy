import { describe, expect, test } from "bun:test";

import { validateAliceOwnerOrigin } from "../src/owner-origin";

describe("Alice owner mutation origin", () => {
  test("rejects malicious-origin preflight and control mutations", () => {
    for (const [method, path] of [
      ["OPTIONS", "/control/api/v1/pauses/all"],
      ["POST", "/control/api/v1/pauses/all"],
      ["POST", "/control/api/v1/model/reserve"],
      ["POST", "/control/api/v1/sessions/session-one/tasks"],
    ]) {
      expect(
        validateAliceOwnerOrigin(
          new Request(`https://alice.rndrntwrk.com${path}`, {
            method,
            headers: { origin: "https://attacker.example" },
          }),
        ),
      ).toEqual({ ok: false, code: "ALICE_OWNER_ORIGIN_DENIED" });
    }
  });

  test("accepts exact-origin browser requests and non-browser clients", () => {
    expect(
      validateAliceOwnerOrigin(
        new Request("https://alice.rndrntwrk.com/control/api/v1/pauses/all", {
          method: "POST",
          headers: {
            origin: "https://alice.rndrntwrk.com",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toEqual({ ok: true });
    expect(
      validateAliceOwnerOrigin(
        new Request("https://alice.rndrntwrk.com/control/health"),
      ),
    ).toEqual({ ok: true });
  });

  test("rejects alternate hosts and cross-site unsafe requests without Origin", () => {
    expect(
      validateAliceOwnerOrigin(
        new Request("https://alice-control.workers.dev/control/health"),
      ),
    ).toEqual({ ok: false, code: "ALICE_OWNER_HOST_DENIED" });
    expect(
      validateAliceOwnerOrigin(
        new Request("https://alice.rndrntwrk.com/control/api/v1/pauses/all", {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toEqual({ ok: false, code: "ALICE_OWNER_ORIGIN_DENIED" });
  });
});
