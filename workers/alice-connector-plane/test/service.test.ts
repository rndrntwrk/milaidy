import { describe, expect, test } from "bun:test";

import { createAliceConnectorService } from "../src/service";

describe("private Alice connector service", () => {
  test("authenticates before parsing and exposes only bounded connector operations", async () => {
    const calls: string[] = [];
    const service = createAliceConnectorService({
      token: "connector-service-token-with-at-least-32-bytes",
      planeFor: () => ({
        status() {
          calls.push("status");
          return { discord: { state: "inert" } };
        },
        async restore() {
          calls.push("restore");
          return {};
        },
        async recordInbound() {
          calls.push("inbound");
          return {};
        },
        async sendOutbound() {
          calls.push("outbound");
          return {};
        },
      }),
    });
    const invoke = (body: string, headers: Record<string, string> = {}) =>
      service.fetch(
        new Request("https://connector.internal/v1/connectors", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body,
        }),
      );
    expect((await invoke("not-json")).status).toBe(401);
    expect(calls).toHaveLength(0);
    const authorized = {
      "x-alice-connector-token":
        "connector-service-token-with-at-least-32-bytes",
    };
    expect(
      (
        await invoke(
          JSON.stringify({
            operation: "connector.status",
            channel: "discord",
          }),
          authorized,
        )
      ).status,
    ).toBe(200);
    expect(calls).toEqual(["status"]);
    expect(
      (
        await invoke(
          JSON.stringify({
            operation: "sql",
            channel: "discord",
            statement: "SELECT 1",
          }),
          authorized,
        )
      ).status,
    ).toBe(400);
    expect(calls).toEqual(["status"]);
  });

  test("rejects public origins and oversized envelopes without invoking a connector", async () => {
    const service = createAliceConnectorService({
      token: "connector-service-token-with-at-least-32-bytes",
      planeFor: () => {
        throw new Error("must not invoke");
      },
    });
    const headers = {
      "content-type": "application/json",
      "x-alice-connector-token":
        "connector-service-token-with-at-least-32-bytes",
    };
    expect(
      (
        await service.fetch(
          new Request("https://connector.internal/v1/connectors", {
            method: "POST",
            headers: { ...headers, origin: "https://alice.rndrntwrk.com" },
            body: JSON.stringify({
              operation: "connector.status",
              channel: "discord",
            }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await service.fetch(
          new Request("https://connector.internal/v1/connectors", {
            method: "POST",
            headers,
            body: JSON.stringify({
              operation: "connector.status",
              channel: "discord",
              padding: "x".repeat(70_000),
            }),
          }),
        )
      ).status,
    ).toBe(413);
  });
});
