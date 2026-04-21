import { afterEach, describe, expect, it, vi } from "vitest";
import { MiladyClient } from "./client";

describe("MiladyClient Alice operator plan execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an extended timeout for operator plan execution", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({ results: [] } as never);
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.executeAliceOperatorPlan({
      steps: [{ action: "STREAM555_GO_LIVE", params: { inputType: "avatar" } }],
      stopOnFailure: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/alice/operator/execute",
      {
        method: "POST",
        body: JSON.stringify({
          steps: [{ action: "STREAM555_GO_LIVE", params: { inputType: "avatar" } }],
          stopOnFailure: true,
        }),
      },
      { timeoutMs: 45_000 },
    );
  });
});
