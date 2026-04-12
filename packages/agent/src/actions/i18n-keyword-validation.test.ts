import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../security/access.js", () => ({
  hasOwnerAccess: vi.fn().mockResolvedValue(true),
}));

import { launchAppAction } from "./app-control";
import { restartAction } from "./restart";
import { setUserNameAction } from "./set-user-name";
import { terminalAction } from "./terminal";

function okResponse(body: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("localized keyword validation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("accepts restart requests in other supported languages", async () => {
    await expect(
      restartAction.validate?.(
        {} as never,
        {
          content: {
            text: "reinicia el agente",
          },
        } as never,
        {} as never,
      ),
    ).resolves.toBe(true);
  });

  it("extracts localized launch-app commands", async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        success: true,
        displayName: "Shopify",
        launchUrl: null,
      }),
    );

    const result = await launchAppAction.handler?.(
      {} as never,
      {
        content: {
          text: "abre shopify",
        },
      } as never,
      {} as never,
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Shopify");
  });

  it("extracts localized terminal commands", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse());

    const result = await terminalAction.handler?.(
      {} as never,
      {
        content: {
          text: "ejecuta ls -la",
        },
      } as never,
      {} as never,
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("ls -la");
  });

  it("matches name-update context in other supported languages", async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse({
        ui: {
          ownerName: "Sam",
        },
      }),
    );

    const valid = await setUserNameAction.validate?.(
      {} as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "me llamo Sam",
        },
      } as never,
      {
        recentMessagesData: [
          {
            content: {
              text: "me llamo Sam",
            },
          },
        ],
      } as never,
    );

    expect(valid).toBe(true);
  });
});
