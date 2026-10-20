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
          steps: [
            { action: "STREAM555_GO_LIVE", params: { inputType: "avatar" } },
          ],
          stopOnFailure: true,
        }),
      },
      { timeoutMs: 45_000 },
    );
  });

  it("uses the configured native session for Arcade reads and selection", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockImplementation(async (path) =>
        path === "/api/stream/status"
          ? ({
              ok: true,
              nativeStatus: "live",
              sessionId: "alice_native_session",
            } as never)
          : ({ ok: true } as never),
      );
    const client = new MiladyClient("http://127.0.0.1:31337");
    await client.getArcade555GameState();
    await client.playArcade555Game({ gameId: "555drive" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/v1/sessions/alice_native_session/games/state",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/v1/sessions/alice_native_session/games/play",
      {
        method: "POST",
        body: JSON.stringify({ gameId: "555drive", mode: "agent" }),
      },
    );
  });

  it("does not create a local Arcade session when native binding is invalid", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({
        ok: true,
        nativeStatus: "live",
      } as never);
    const client = new MiladyClient("http://127.0.0.1:31337");
    await expect(
      client.playArcade555Game({ gameId: "555drive" }),
    ).rejects.toThrow("configured native session");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/stream/status");

    fetchSpy
      .mockClear()
      .mockResolvedValue({
        ok: true,
        nativeStatus: "live",
        sessionId: "alice_native_session",
      } as never);
    await expect(
      client.playArcade555Game({
        gameId: "555drive",
        sessionId: "other-session",
      }),
    ).rejects.toThrow("configured native session");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit legacy Arcade sessions when no native binding exists", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockImplementation(async (path) =>
        path === "/api/stream/status"
          ? ({ ok: true, running: false } as never)
          : ({ ok: true } as never),
      );
    const client = new MiladyClient("http://127.0.0.1:31337");
    await client.playArcade555Game({
      gameId: "555drive",
      sessionId: "legacy-session",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/v1/sessions/legacy-session/games/play",
      expect.any(Object),
    );
  });
});
