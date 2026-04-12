import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../security/access.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../security/access.js")>();
  return {
    ...actual,
    hasOwnerAccess: vi.fn().mockResolvedValue(true),
    hasAdminAccess: vi.fn().mockResolvedValue(true),
    hasLifeOpsAccess: vi.fn().mockResolvedValue(true),
    hasRoleAccess: vi.fn().mockResolvedValue(true),
    hasPrivateAccess: vi.fn().mockResolvedValue(true),
  };
});

import { updateRoleAction } from "../runtime/roles/src/action";
import { createTriggerTaskAction } from "../triggers/action";
import { launchAppAction, stopAppAction } from "./app-control";
import { calendarAction } from "./calendar";
import { readEntityAction, searchEntityAction } from "./entity-actions";
import { gmailAction } from "./gmail";
import { readChannelAction } from "./read-channel";
import { restartAction } from "./restart";
import { searchConversationsAction } from "./search-conversations";
import { sendAdminMessageAction } from "./send-admin-message";
import { sendMessageAction } from "./send-message";
import { setUserNameAction } from "./set-user-name";
import { goLiveAction, goOfflineAction } from "./stream-control";
import { terminalAction } from "./terminal";
import { webSearchAction } from "./web-search";

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-1",
    getSetting: vi.fn(),
    getMemories: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as never;
}

function makeMessage(text: string, extra?: Record<string, unknown>) {
  return {
    entityId: "owner-1",
    roomId: "room-1",
    content: {
      text,
      source: "client_chat",
      ...(extra ?? {}),
    },
  } as never;
}

function okJsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("localized validate audit for Milady keyword-gated actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("validates restart requests in Spanish", async () => {
    await expect(
      restartAction.validate?.(
        makeRuntime(),
        makeMessage("reinicia el agente"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates launch-app requests in Spanish", async () => {
    await expect(
      launchAppAction.validate?.(
        makeRuntime(),
        makeMessage("abre la app shopify"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates stop-app requests in Korean", async () => {
    await expect(
      stopAppAction.validate?.(
        makeRuntime(),
        makeMessage("shopify 앱 종료"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates terminal requests in Spanish", async () => {
    await expect(
      terminalAction.validate?.(
        makeRuntime(),
        makeMessage("ejecuta ls -la"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates remembered-name context in Spanish", async () => {
    vi.mocked(fetch).mockResolvedValue(
      okJsonResponse({
        ui: {
          ownerName: "Sam",
        },
      }),
    );

    await expect(
      setUserNameAction.validate?.(makeRuntime(), makeMessage("me llamo Sam"), {
        recentMessagesData: [
          {
            content: {
              text: "me llamo Sam",
            },
          },
        ],
      } as never),
    ).resolves.toBe(true);
  });

  it("validates web-search requests in Spanish", async () => {
    await expect(
      webSearchAction.validate?.(
        makeRuntime({
          getSetting: vi.fn((key: string) =>
            key === "BRAVE_API_KEY" ? "test-key" : undefined,
          ),
        }),
        makeMessage("busca en la web el precio de bitcoin"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates send-message requests in Portuguese", async () => {
    await expect(
      sendMessageAction.validate?.(
        makeRuntime(),
        makeMessage("enviar mensagem para Alice"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates send-admin-message requests in Chinese", async () => {
    await expect(
      sendAdminMessageAction.validate?.(
        makeRuntime(),
        makeMessage("通知管理员"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates search-conversations requests in Spanish", async () => {
    await expect(
      searchConversationsAction.validate?.(
        makeRuntime(),
        makeMessage("buscar conversaciones anteriores"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates read-channel requests in Korean", async () => {
    await expect(
      readChannelAction.validate?.(
        makeRuntime(),
        makeMessage("채팅 기록 읽어줘"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates go-live requests in Spanish", async () => {
    await expect(
      goLiveAction.validate?.(
        makeRuntime(),
        makeMessage("iniciar stream ahora"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates go-offline requests in Portuguese", async () => {
    await expect(
      goOfflineAction.validate?.(
        makeRuntime(),
        makeMessage("parar stream agora"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates search-entity requests in Spanish", async () => {
    await expect(
      searchEntityAction.validate?.(
        makeRuntime(),
        makeMessage("buscar persona Alice"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates read-entity requests in Chinese", async () => {
    await expect(
      readEntityAction.validate?.(
        makeRuntime(),
        makeMessage("查找联系人 Alice"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates gmail requests in Spanish", async () => {
    await expect(
      gmailAction.validate?.(
        makeRuntime(),
        makeMessage("buscar correo de Alice"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates calendar requests in Korean", async () => {
    await expect(
      calendarAction.validate?.(
        makeRuntime(),
        makeMessage("내 일정 보여줘"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates role-update requests in Spanish", async () => {
    await expect(
      updateRoleAction.validate?.(
        makeRuntime(),
        makeMessage("cambia el rol de alice a administrador"),
        undefined,
      ),
    ).resolves.toBe(true);
  });

  it("validates trigger-creation requests in Spanish", async () => {
    const triggerAction = createTriggerTaskAction;
    await expect(
      triggerAction.validate?.(
        makeRuntime(),
        makeMessage("programa un recordatorio cada semana"),
        undefined,
      ),
    ).resolves.toBe(true);
  });
});
