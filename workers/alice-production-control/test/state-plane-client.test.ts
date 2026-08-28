import { expect, test } from "bun:test";

import { createAliceStatePlaneClient } from "../src/state-plane-client";

test("uses only the private service binding with the state token and exact operation", async () => {
  let seen: Request | undefined;
  const client = createAliceStatePlaneClient(
    {
      async fetch(request: Request) {
        seen = request;
        return Response.json({ ok: true, records: [] });
      },
    },
    "state-plane-token-with-at-least-32-bytes",
  );
  await client.applyAtomic({ operationId: "operation-001", records: [] });
  expect(seen?.url).toBe("https://alice-state.internal/v1/state");
  expect(seen?.headers.get("x-alice-state-token")).toBe(
    "state-plane-token-with-at-least-32-bytes",
  );
  expect(await seen?.json()).toEqual({
    operation: "records.atomic",
    operationId: "operation-001",
    records: [],
  });
  expect(seen?.headers.has("authorization")).toBe(false);
});
