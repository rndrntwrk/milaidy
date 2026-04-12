import { describe, expect, it } from "vitest";
import { MiladyClient } from "./client";

type FetchCall = {
  path: string;
  init?: RequestInit;
  options?: { allowNonOk?: boolean; timeoutMs?: number };
};

class RecordingMiladyClient extends MiladyClient {
  calls: FetchCall[] = [];

  override async fetch<T>(
    path: string,
    init?: RequestInit,
    options?: { allowNonOk?: boolean; timeoutMs?: number },
  ): Promise<T> {
    this.calls.push({ path, init, options });
    return { ok: true } as T;
  }
}

describe("MiladyClient plugin registry mutations", () => {
  it("sends release stream options for plugin installs", async () => {
    const client = new RecordingMiladyClient("http://127.0.0.1:31337");

    await client.installRegistryPlugin("@elizaos/plugin-test", false, {
      stream: "alpha",
      version: "2.0.0-alpha.7",
    });

    expect(client.calls).toEqual([
      {
        path: "/api/plugins/install",
        init: {
          method: "POST",
          body: JSON.stringify({
            name: "@elizaos/plugin-test",
            autoRestart: false,
            stream: "alpha",
            version: "2.0.0-alpha.7",
          }),
        },
        options: { timeoutMs: 120_000 },
      },
    ]);
  });

  it("sends release stream options for plugin updates", async () => {
    const client = new RecordingMiladyClient("http://127.0.0.1:31337");

    await client.updateRegistryPlugin("@elizaos/plugin-test", false, {
      stream: "latest",
    });

    expect(client.calls).toEqual([
      {
        path: "/api/plugins/update",
        init: {
          method: "POST",
          body: JSON.stringify({
            name: "@elizaos/plugin-test",
            autoRestart: false,
            stream: "latest",
          }),
        },
        options: { timeoutMs: 120_000 },
      },
    ]);
  });
});
