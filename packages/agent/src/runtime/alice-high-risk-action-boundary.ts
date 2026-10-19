import {
  hasRoleAccess,
  type Action,
  type AgentRuntime,
  type Content,
  type IAgentRuntime,
  type Memory,
} from "@elizaos/core";
import { chatReadAction, streamStatusAction } from "@rndrntwrk/plugin-555stream";
import { aliceChatCodingAction } from "./alice-chat-coding.js";

import {
  type AliceRuntimeProfileEnv,
  isAliceFullRuntimeProfile,
} from "./alice-runtime-profile.js";

const ACTION_GUARDED = Symbol.for("rndrntwrk.alice.high-risk-action-guard.v1");
const RUNTIME_GUARD_INSTALLED = Symbol.for(
  "rndrntwrk.alice.high-risk-runtime-guard.v1",
);

type GuardableRuntime = Pick<AgentRuntime, "actions" | "logger"> & {
  registerAction?: AgentRuntime["registerAction"];
  providers?: AgentRuntime["providers"];
  registerProvider?: AgentRuntime["registerProvider"];
};

/**
 * Admit reviewed response, read-only, presentation, and native owner-checked
 * pairing actions by exact name. Coding has a separate concrete native handler
 * below; all other execution requires an independently verified grant.
 */
export const ALICE_FULL_GATED_SAFE_ACTION_NAMES = Object.freeze([
  "REPLY",
  "IGNORE",
  "STOP",
  "NONE",
  "CHECK_BALANCE",
  "READ_ENTITY",
  "SEARCH_ENTITY",
  "READ_CHANNEL",
  "SEARCH_CONVERSATIONS",
  "WEB_SEARCH",
  "PLAY_EMOTE",
  // Native owner-only issuance retains its role gate and handler owner check.
  "PAIR_OWNER_ACCOUNT",
] as const);

const ALICE_FULL_GATED_SAFE_ACTION_SET = new Set<string>(
  ALICE_FULL_GATED_SAFE_ACTION_NAMES,
);

async function ownerStreamRead(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
  const source = message.content?.source;
  const metadata = message.metadata as { fromBot?: unknown; source?: unknown } | undefined;
  if (!runtime.agentId || !message.id || !message.entityId || !message.roomId ||
      message.agentId !== runtime.agentId || message.entityId === runtime.agentId ||
      !["client_chat", "discord", "telegram"].includes(String(source))) return false;
  if (source !== "client_chat" && (metadata?.fromBot !== false || metadata?.source !== source)) return false;
  try { return await hasRoleAccess(runtime, message, "OWNER"); }
  catch { return false; }
}

export function isAliceFullGatedSafeActionName(name: string): boolean {
  return ALICE_FULL_GATED_SAFE_ACTION_SET.has(name);
}

export function enforceAliceActionExecutionBoundary<T extends Action>(
  action: T,
  environment: AliceRuntimeProfileEnv = process.env,
): T {
  if (!isAliceFullRuntimeProfile(environment)) return action;

  // This concrete native handler verifies the incoming owner message. A same-name
  // desktop executor stays denied; the controller admits only an exact draft PR grant.
  if (action === aliceChatCodingAction) return action;

  const marked = action as T & { [ACTION_GUARDED]?: true };
  if (marked[ACTION_GUARDED] || isAliceFullGatedSafeActionName(action.name)) {
    return action;
  }
  // Admit only the actual native read implementations, and recheck the owner
  // at execution. Same-name plugins and unsupported Stream writes stay denied.
  if (action === (chatReadAction as unknown) || action === (streamStatusAction as unknown)) {
    const guarded = {
      ...action,
      validate: async (...args: Parameters<Action["validate"]>) =>
        await ownerStreamRead(args[0], args[1]) && await action.validate(...args),
      handler: async (...args: Parameters<Action["handler"]>) => {
        if (await ownerStreamRead(args[0], args[1])) return action.handler(...args);
        return { success: false, error: "ALICE_OWNER_REQUIRED", text: "Only a verified owner can read this Stream session." };
      },
    } as T & { [ACTION_GUARDED]?: true };
    Object.defineProperty(guarded, ACTION_GUARDED, { value: true });
    return guarded;
  }
  const guarded = {
    ...action,
    // Do not offer a tool that this runtime can never execute. Keep the handler
    // denial as well, so direct calls cannot bypass the planner's validation.
    validate: async () => false,
    handler: async (...args: Parameters<Action["handler"]>) => {
      const text = `ALICE_HIGH_RISK_ACTION_DENIED: ${action.name} requires an independently verified capability grant.`;
      const callback = args[4];
      if (callback) {
        await callback({
          text,
          action: "ALICE_HIGH_RISK_ACTION_DENIED",
        } as Content);
      }
      return { success: false, text, error: "ALICE_HIGH_RISK_ACTION_DENIED" };
    },
  } as T & { [ACTION_GUARDED]?: true };
  Object.defineProperty(guarded, ACTION_GUARDED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return guarded;
}

export function installAliceHighRiskActionBoundary(
  runtime: GuardableRuntime,
  environment: AliceRuntimeProfileEnv = process.env,
): void {
  if (!isAliceFullRuntimeProfile(environment)) return;
  for (let index = 0; index < runtime.actions.length; index += 1) {
    runtime.actions[index] =
      runtime.actions[index].name === "CREATE_TASK"
        ? aliceChatCodingAction
        : enforceAliceActionExecutionBoundary(
            runtime.actions[index],
            environment,
          );
  }
  // The desktop examples teach workspace provisioning through denied actions.
  // Alice's native action already describes the owner-to-draft-PR workflow.
  if (runtime.providers) {
    for (let index = runtime.providers.length - 1; index >= 0; index -= 1) {
      if (runtime.providers[index].name === "CODING_AGENT_EXAMPLES") {
        runtime.providers.splice(index, 1);
      }
    }
  }

  const marked = runtime as GuardableRuntime & {
    [RUNTIME_GUARD_INSTALLED]?: true;
  };
  if (marked[RUNTIME_GUARD_INSTALLED]) return;
  if (typeof runtime.registerProvider === "function") {
    const registerProvider = runtime.registerProvider.bind(runtime);
    runtime.registerProvider = (provider): void => {
      if (provider.name !== "CODING_AGENT_EXAMPLES") registerProvider(provider);
    };
  }
  if (typeof runtime.registerAction === "function") {
    const registerAction = runtime.registerAction.bind(runtime);
    runtime.registerAction = (action: Action): void => {
      registerAction(
        action.name === "CREATE_TASK"
          ? aliceChatCodingAction
          : enforceAliceActionExecutionBoundary(action, environment),
      );
    };
    // Core plugins register before the application plugin. Reserve the native
    // handler here so the desktop orchestrator cannot win that name collision.
    runtime.registerAction(aliceChatCodingAction);
  }
  Object.defineProperty(marked, RUNTIME_GUARD_INSTALLED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
