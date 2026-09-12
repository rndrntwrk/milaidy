import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { Context, Telegraf } from "telegraf";
import ts from "typescript";
import { afterAll, beforeAll, expect, test } from "vitest";
import { applyAliceTelegramOwnerPairingPatch } from "./apply-alice-eliza-runtime-patches.mjs";

// Apply the build patch to an isolated copy of the pinned submodule. The
// override selects an existing hydrated checkout without changing its files.
const sourceRoot = process.env.ALICE_ELIZA_TEST_ROOT ?? path.resolve("eliza");
const temporaryRoot = mkdtempSync(
  path.join(os.tmpdir(), "alice-telegram-pairing-test-"),
);
const telegramRoot = path.join(temporaryRoot, "plugins/plugin-telegram/src");
beforeAll(() => {
  mkdirSync(telegramRoot, { recursive: true });
  for (const name of ["service.ts", "owner-pairing-service.ts"]) {
    writeFileSync(
      path.join(telegramRoot, name),
      readFileSync(path.join(sourceRoot, "plugins/plugin-telegram/src", name)),
    );
  }
  const options = { elizaRoot: temporaryRoot, log: () => {} };
  expect(["applied", "already-applied"]).toContain(
    applyAliceTelegramOwnerPairingPatch(options),
  );
  expect(applyAliceTelegramOwnerPairingPatch(options)).toBe("already-applied");
});
afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const logger = { info() {}, warn() {}, debug() {}, error() {}, success() {} };
const compile = (source: string) =>
  ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  });

function fixture() {
  const source = readFileSync(path.join(telegramRoot, "service.ts"), "utf8");
  const parsed = ts.createSourceFile(
    "service.ts",
    source,
    ts.ScriptTarget.Latest,
  );
  const declaration = parsed.statements.find(
    (node) =>
      ts.isClassDeclaration(node) && node.name?.text === "TelegramService",
  );
  if (!declaration || !ts.isClassDeclaration(declaration))
    throw new Error("TelegramService absent");
  const methods = declaration.members
    .filter(
      (node) =>
        ts.isMethodDeclaration(node) &&
        [
          "start",
          "initializeBot",
          "setupMiddlewares",
          "setupMessageHandlers",
          "authorizationMiddleware",
          "checkChatAccess",
        ].includes(node.name.getText(parsed)),
    )
    .map((node) => node.getText(parsed))
    .join("\n");
  const bot = new Telegraf("unused-local-test-token");
  const botInfo = {
    id: 1,
    is_bot: true as const,
    first_name: "Alice",
    username: "alice_test_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  };
  let replies = 0;
  bot.telegram.callApi = async () => {
    replies++;
    return {} as never;
  };
  bot.telegram.getMe = async () => botInfo;
  const verifications: unknown[] = [];
  let messages = 0;
  const state = {
    accountId: "default",
    account: { botToken: null, config: {} },
    bot,
    messageManager: {
      handleMessage: async () => {
        messages++;
      },
    },
  };
  let ready: () => void = () => {};
  const readiness = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const launchHandlerCounts: number[] = [];
  let commands = 0;
  const command = bot.command.bind(bot);
  bot.command = (...args) => {
    commands++;
    return command(...args);
  };
  const runtime = {
    agentId: "test-agent",
    character: { name: "Alice" },
    hasService: (name: string) => name === "OWNER_BIND_VERIFY",
    getServiceLoadPromise: async () => readiness,
    getService: () => ({
      verifyOwnerBindFromConnector: async (params: unknown) => {
        verifications.push(params);
        return { success: true };
      },
    }),
    getSetting: (key: string) =>
      key === "TELEGRAM_ALLOWED_CHATS" ? '["424242"]' : undefined,
    emitEvent: async () => {},
    fixture: {
      bot,
      botToken: null,
      defaultAccountId: "default",
      accountStates: new Map([["default", state]]),
      getAccountState: () => state,
      chatAndEntityMiddleware: async (
        _ctx: unknown,
        next: () => Promise<void>,
      ) => next(),
      launchPollerSupervised: async () => {
        launchHandlerCounts.push(commands);
        if (launchHandlerCounts.length === 1)
          throw new Error("local retry fixture");
      },
    },
  };
  const nativeExports = {};
  runInNewContext(
    compile(
      readFileSync(path.join(telegramRoot, "owner-pairing-service.ts"), "utf8"),
    ),
    {
      exports: nativeExports,
      require: () => ({
        logger,
        Service: class {},
        TELEGRAM_SERVICE_NAME: "telegram",
      }),
    },
  );
  const Service = runInNewContext(
    compile(
      `class TelegramService { constructor(runtime) { Object.assign(this, runtime.fixture); this.runtime = runtime; } ${methods} }\nTelegramService`,
    ),
    {
      exports: {},
      logger,
      ...nativeExports,
      shouldStartTelegramStandaloneBot: () => false,
      listEnabledTelegramAccounts: () => [],
      registerTelegramCommandHandlers: (activeBot: typeof bot) => {
        activeBot.command("help", async (ctx) => {
          await ctx.reply("help");
        });
        return ["help"];
      },
      registerTelegramTaskBoardCommand: () => {},
      applyTelegramSetMyCommands: async () => {},
      TelegramEventTypes: { SLASH_START: "start" },
      process: { once() {} },
      setTimeout: (callback: () => void) => callback(),
    },
  );
  async function deliver(id: number, text: string, group = false) {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        from: { id, is_bot: false, first_name: "Fixture" },
        chat: {
          id,
          type: group ? ("group" as const) : ("private" as const),
          title: "Fixture",
          first_name: "Fixture",
        },
        text,
        ...(text.startsWith("/")
          ? {
              entities: [
                {
                  type: "bot_command" as const,
                  offset: 0,
                  length: text.split(" ")[0].length,
                },
              ],
            }
          : {}),
      },
    };
    await bot.middleware()(
      new Context(update, bot.telegram, botInfo),
      async () => {},
    );
  }
  return {
    start: () => Service.start(runtime),
    ready,
    launchHandlerCounts,
    verifications,
    deliver,
    counts: () => ({ messages, replies }),
  };
}

test("native Telegram waits for owner binding and installs handlers once before polling/retry", async () => {
  const f = fixture();
  const starting = f.start();
  await Promise.resolve();
  expect(f.launchHandlerCounts).toEqual([]);
  f.ready();
  await starting;
  expect(f.launchHandlerCounts).toEqual([3, 3]);
  await f.deliver(424242, "/eliza_pair 123456");
  expect(f.verifications).toEqual([
    {
      connector: "telegram",
      externalId: "424242",
      displayHandle: "Fixture",
      code: "123456",
    },
  ]);
  expect(f.counts().messages).toBe(0);
});

test("native authorization denies unlisted commands and messages before their handlers", async () => {
  const f = fixture();
  f.ready();
  await f.start();
  await f.deliver(666666, "/eliza_pair 123456");
  await f.deliver(666666, "/help");
  await f.deliver(666666, "ordinary message");
  await f.deliver(-424242, "/eliza_pair 123456", true);
  expect(f.verifications).toEqual([]);
  expect(f.counts()).toEqual({ messages: 0, replies: 0 });
  await f.deliver(424242, "ordinary owner message");
  expect(f.counts().messages).toBe(1);
});
