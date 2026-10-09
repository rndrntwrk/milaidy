import { createHmac } from "node:crypto";
import {
  type Action,
  createUniqueUuid,
  hasRoleAccess,
  type IAgentRuntime,
  inspectSendHandlerResult,
  type Memory,
  type Plugin,
  Service,
  type TargetInfo,
} from "@elizaos/core";
import {
  type AliceRuntimeProfileEnv,
  isAliceFullRuntimeProfile,
} from "./alice-runtime-profile";

const HOST = "http://alice-coding.internal";
const CACHE = "alice:chat-coding:tasks:v1";
const SERVICE = "ALICE_CHAT_CODING";
const REPOSITORY =
  /^(rndrntwrk|Render-Network-OS)\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;
const TERMINAL = new Set(["completed", "failed", "expired"]);
type NativeCodingTask = {
  schemaVersion: "alice.native-coding.v1";
  requestId: string;
  issuedAt: number;
  message: {
    id: string;
    entityId: string;
    roomId: string;
    source: "discord" | "telegram";
    accountId: string;
    externalId: string;
    externalMessageId: string;
    channelId: string;
    threadId?: string;
    serverId?: string;
  };

  request: {
    repository: string;
    baseCommit: string;
    prompt: string;
    delivery: "pull-request";
  };
};
type ChatTask = {
  native: NativeCodingTask;
  origin: TargetInfo;
  created: boolean;
  lastStatus: string;
  startAttempts: number;
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function ownerMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  const metadata = message?.metadata;
  return (
    !!runtime.agentId &&
    !!message?.id &&
    !!message.entityId &&
    !!message.roomId &&
    message.agentId === runtime.agentId &&
    message.entityId !== runtime.agentId &&
    record(metadata) &&
    metadata.fromBot === false &&
    metadata.source === message.content.source &&
    ["discord", "telegram"].includes(String(message.content.source)) &&
    (await hasRoleAccess(runtime, message, "OWNER"))
  );
}
function nativeMessage(message: Memory): NativeCodingTask["message"] {
  const source = message.content.source;
  const metadata = message.metadata;
  if (
    (source !== "discord" && source !== "telegram") ||
    !message.id ||
    !record(metadata)
  )
    throw new Error("CODING_NATIVE_MESSAGE_REQUIRED");
  const connector: unknown = metadata[source];
  if (!record(connector)) throw new Error("CODING_NATIVE_MESSAGE_REQUIRED");
  const accountId = metadata.accountId;
  const externalId = String(connector.userId ?? metadata.fromId ?? "");
  const externalMessageId = String(
    connector.messageId ?? metadata.messageIdFull ?? "",
  );
  const channelId = String(
    source === "discord"
      ? (connector.channelId ?? "")
      : (connector.chatId ?? ""),
  );
  if (
    typeof accountId !== "string" ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(accountId) ||
    !/^[0-9]{1,24}$/.test(externalId) ||
    !/^[0-9]{1,24}$/.test(externalMessageId) ||
    !/^-?[0-9]{1,24}$/.test(channelId)
  )
    throw new Error("CODING_NATIVE_MESSAGE_REQUIRED");
  const threadId = connector.threadId;
  const serverId = connector.guildId;
  return {
    id: message.id,
    entityId: message.entityId,
    roomId: message.roomId,
    source,
    accountId,
    externalId,
    externalMessageId,
    channelId,
    ...(typeof threadId === "string" || typeof threadId === "number"
      ? { threadId: String(threadId) }
      : {}),
    ...(typeof serverId === "string" ? { serverId } : {}),
  };
}

/** Native owner messages admit draft PR work; the controller owns execution and merge authority. */
export class AliceChatCodingService extends Service {
  static override serviceType = SERVICE;
  capabilityDescription =
    "Starts verified owner coding requests and returns draft PRs to the original conversation";
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<unknown> = Promise.resolve();
  private stopped = false;
  constructor(
    runtime?: IAgentRuntime,
    private readonly fetcher: typeof fetch = fetch,
    private readonly token = process.env.MILADY_API_TOKEN ?? "",
  ) {
    super(runtime);
    if (!runtime) throw new Error("CODING_CHAT_RUNTIME_REQUIRED");
  }
  static async start(runtime: IAgentRuntime): Promise<AliceChatCodingService> {
    const service = new AliceChatCodingService(runtime);
    service.timer = setInterval(() => {
      void service
        .poll()
        .catch((error) =>
          runtime.logger.warn(`[alice-chat-coding] ${String(error)}`),
        );
    }, 30_000);
    service.timer.unref?.();
    return service;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private async save(tasks: ChatTask[]): Promise<void> {
    if (!(await this.runtime.setCache(CACHE, tasks)))
      throw new Error("CODING_CHAT_PERSISTENCE_FAILED");
  }
  private async request(
    path: string,
    body?: NativeCodingTask,
  ): Promise<Record<string, unknown>> {
    if (body && this.token.length < 32)
      throw new Error("CODING_NATIVE_AUTH_UNAVAILABLE");
    const raw = body ? JSON.stringify(body) : undefined;
    const signature = raw
      ? createHmac("sha256", this.token)
          .update(`alice.native-coding.v1\n${raw}`)
          .digest("hex")
      : "";
    const response = await this.fetcher(HOST + path, {
      ...(raw === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-alice-native-coding-signature": signature,
            },
            body: raw,
          }),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    const value: unknown = await response.json();
    if (!response.ok || !record(value) || value.ok !== true) {
      throw new Error(
        record(value) && typeof value.code === "string"
          ? value.code
          : "CODING_CHAT_UNAVAILABLE",
      );
    }
    return value;
  }
  async startTask(
    message: Memory,
    repository: string,
    prompt: string,
  ): Promise<string> {
    if (!(await ownerMessage(this.runtime, message)))
      throw new Error("CODING_OWNER_REQUIRED");
    if (
      !REPOSITORY.test(repository) ||
      !prompt.trim() ||
      !message.content.text?.trim()
    ) {
      throw new Error("CODING_REQUEST_INVALID");
    }
    const exactPrompt = `Owner request:\n${message.content.text}\n\nTask scope:\n${prompt}`;
    if (new TextEncoder().encode(exactPrompt).byteLength > 16_384)
      throw new Error("CODING_REQUEST_TOO_LARGE");
    const provenance = nativeMessage(message);
    const room = await this.runtime.getRoom(message.roomId);
    if (
      !room?.channelId ||
      room.id !== message.roomId ||
      room.source !== message.content.source
    )
      throw new Error("CODING_CHAT_ORIGIN_INVALID");
    return this.serial(async () => {
      if (this.stopped) throw new Error("CODING_CHAT_STOPPED");
      let tasks = (await this.runtime.getCache<ChatTask[]>(CACHE)) ?? [];
      const requestId = createUniqueUuid(
        this.runtime,
        `alice-coding:${message.id}`,
      );
      let task = tasks.find((entry) => entry.native.requestId === requestId);
      if (!task) {
        // Retain active records and recent terminal receipts without unbounded cache growth.
        if (
          tasks.filter((entry) => !TERMINAL.has(entry.lastStatus)).length >= 50
        )
          throw new Error("CODING_CHAT_TOO_MANY_PENDING");
        tasks = tasks
          .filter((entry) => !TERMINAL.has(entry.lastStatus))
          .concat(
            tasks.filter((entry) => TERMINAL.has(entry.lastStatus)).slice(-49),
          );
        const head = await this.request(
          `/v1/repository?repository=${encodeURIComponent(repository)}`,
        );
        if (
          typeof head.baseCommit !== "string" ||
          !/^[a-f0-9]{40}$/.test(head.baseCommit)
        )
          throw new Error("CODING_BASE_INVALID");
        task = {
          native: {
            schemaVersion: "alice.native-coding.v1",
            requestId,
            issuedAt: Date.now(),
            message: provenance,
            request: {
              repository,
              baseCommit: head.baseCommit,
              prompt: exactPrompt,
              delivery: "pull-request",
            },
          },
          origin: {
            source: room.source,
            roomId: room.id,
            channelId: room.channelId,
            serverId: room.serverId,
            accountId: provenance.accountId,
            ...(provenance.threadId ? { threadId: provenance.threadId } : {}),
          },
          created: false,
          lastStatus: "pending",
          startAttempts: 0,
        };
        tasks.push(task);
        // Save the exact request and trusted destination before the network mutation.
        await this.save(tasks);
      }
      if (!task.created) {
        task.startAttempts += 1;
        await this.save(tasks);
        const result = await this.request("/v1/tasks", task.native);
        task.created = true;
        // A reconciled start can already be terminal. Leave that status for
        // polling to deliver before recording it as reported to the owner.
        if (typeof result.status === "string" && !TERMINAL.has(result.status))
          task.lastStatus = result.status;
        await this.save(tasks);
      }
      return task.lastStatus === "queued" || task.lastStatus === "running"
        ? `Started on ${task.native.request.repository}. I'll post the draft PR here for your review.`
        : `Your coding request is ${task.lastStatus}. I'll report its result in this chat.`;
    });
  }
  async poll(): Promise<void> {
    return this.serial(async () => {
      if (this.stopped) return;
      const tasks = (await this.runtime.getCache<ChatTask[]>(CACHE)) ?? [];
      for (const task of tasks) {
        if (this.stopped || TERMINAL.has(task.lastStatus)) continue;
        try {
          let current: Record<string, unknown>;
          try {
            current = await this.request(`/v1/tasks/${task.native.requestId}`);
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.message !== "CODING_TASK_NOT_FOUND"
            )
              throw error;
            current = { status: "unavailable", code: "CODING_TASK_NOT_FOUND" };
          }
          // Reconcile an uncertain initial create before retrying that exact
          // operation once. Never issue a fresh identity or renew its proof.
          if (!task.created && current.code === "CODING_TASK_NOT_FOUND") {
            if (
              task.startAttempts < 2 &&
              task.native.issuedAt > Date.now() - 300_000
            ) {
              task.startAttempts += 1;
              await this.save(tasks);
              current = await this.request("/v1/tasks", task.native);
            } else {
              current = {
                status: "failed",
                work: { code: "CODING_START_UNCONFIRMED" },
              };
            }
          }
          if (current.status !== "unavailable") task.created = true;
          if (
            typeof current.status !== "string" ||
            current.status === "unavailable" ||
            current.status === task.lastStatus
          )
            continue;
          const work = record(current.work) ? current.work : {};
          const result = record(work.result) ? work.result : {};
          let text: string;
          if (current.status === "completed") {
            const url =
              typeof result.pullRequestUrl === "string"
                ? new URL(result.pullRequestUrl)
                : null;
            if (
              !url ||
              url.origin !== "https://github.com" ||
              !new RegExp(
                `^/${task.native.request.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/[1-9][0-9]*$`,
              ).test(url.pathname) ||
              url.search ||
              url.hash
            )
              throw new Error("CODING_RESULT_INVALID");
            text = `Draft PR ready: ${url.href}`;
            if (typeof result.summary === "string")
              text += `\n${result.summary.slice(0, 800)}`;
          } else if (
            current.status === "failed" ||
            current.status === "expired"
          ) {
            text =
              current.status === "expired"
                ? "The coding request expired before it could start. Send me the request again."
                : `The coding task stopped${typeof work.code === "string" ? ` (${work.code})` : ""}. I haven't retried it.`;
          } else if (
            current.status === "queued" ||
            current.status === "running"
          ) {
            text = `${task.native.request.repository}: the coding task is ${current.status}. I'll post the draft PR here.`;
          } else continue;
          // After a runtime replacement, wait for this connector to register
          // before recording a delivery attempt.
          if (!this.runtime.getService(task.origin.source)) continue;
          // Persist the attempt before sending. An uncertain delivery is never blindly replayed.
          task.lastStatus = current.status;
          await this.save(tasks);
          const delivery = inspectSendHandlerResult(
            await this.runtime.sendMessageToTarget(task.origin, {
              text,
              source: task.origin.source,
            }),
          );
          if (delivery.kind !== "delivered")
            this.runtime.logger.warn(
              `[alice-chat-coding] Delivery for ${task.native.requestId} is ${delivery.kind}; inspect the original chat before retrying`,
            );
        } catch (error) {
          this.runtime.logger.warn(
            `[alice-chat-coding] ${task.native.requestId}: ${String(error)}`,
          );
        }
      }
    });
  }
}

export const aliceChatCodingAction: Action = {
  name: "CREATE_TASK",
  similes: ["CODE_TASK", "START_CODING_TASK", "FIX_BUG", "CREATE_SUBTASK"],
  contexts: ["messaging", "coding"],
  roleGate: { minRole: "OWNER" },
  description:
    "Carry out a code change or bug fix requested by the verified owner in natural Discord or Telegram conversation. Resolve the repository and scope from the conversation, start the existing isolated cloud coding workflow, and post the draft PR back here. No separate task form or task approval is needed. The owner reviews the PR before merge.",
  routingHint:
    "Owner asks to fix a bug or change repository code -> CREATE_TASK; ordinary questions, reminders and Life Ops are not coding tasks. Ask which repository if unclear. Do not ask for a separate task approval; the owner reviews the resulting PR before merge.",
  suppressPostActionContinuation: true,
  suppressEarlyReply: true,
  parameters: [
    {
      name: "repository",
      description:
        "Exact owner/name repository established by the conversation; Alice's own code is rndrntwrk/milaidy",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "prompt",
      description:
        "The requested code change, scope and acceptance criteria; preserve the owner's instructions",
      required: true,
      schema: { type: "string" },
    },
  ],
  validate: ownerMessage,
  handler: async (runtime, message, _state, options, callback) => {
    const service = runtime.getService<AliceChatCodingService>(SERVICE);
    const parameters = record(options?.parameters) ? options.parameters : {};
    const repository = parameters.repository;
    const prompt = parameters.prompt;
    if (
      !service ||
      typeof repository !== "string" ||
      typeof prompt !== "string"
    ) {
      const text = !service
        ? "Coding is unavailable right now."
        : "Which repository should I change, and what should I fix?";
      if (callback) await callback({ text });
      return { success: false, text };
    }
    try {
      const text = await service.startTask(message, repository, prompt);
      if (callback) await callback({ text, action: "CREATE_TASK" });
      return { success: true, text };
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "CODING_CHAT_UNAVAILABLE";
      runtime.logger.warn(`[alice-chat-coding] Start not confirmed: ${code}`);
      const text =
        code === "CODING_OWNER_REQUIRED"
          ? "Only a verified owner account can request code changes."
          : `I couldn't confirm that the coding task started (${code}). I'll check any recorded task and report its status here.`;
      if (callback) await callback({ text });
      return { success: false, text, error: code };
    }
  },
};

export function installAliceChatCoding(
  plugin: Plugin,
  environment: AliceRuntimeProfileEnv = process.env,
): void {
  if (!isAliceFullRuntimeProfile(environment)) return;
  plugin.actions = [
    aliceChatCodingAction,
    ...(plugin.actions ?? []).filter((action) => action.name !== "CREATE_TASK"),
  ];
  plugin.services = [...(plugin.services ?? []), AliceChatCodingService];
}
