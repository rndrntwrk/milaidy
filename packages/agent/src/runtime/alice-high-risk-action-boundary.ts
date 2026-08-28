import type { Action, AgentRuntime, Content } from "@elizaos/core";

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
};

/**
 * Task 1 has no independently verified capability-grant verifier at the
 * action-handler boundary. Keep execution fail-closed and admit only these
 * reviewed response, read-only, and presentation actions by exact name.
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
] as const);

const ALICE_FULL_GATED_SAFE_ACTION_SET = new Set<string>(
  ALICE_FULL_GATED_SAFE_ACTION_NAMES,
);

export function isAliceFullGatedSafeActionName(name: string): boolean {
  return ALICE_FULL_GATED_SAFE_ACTION_SET.has(name);
}

export function enforceAliceActionExecutionBoundary<T extends Action>(
  action: T,
  environment: AliceRuntimeProfileEnv = process.env,
): T {
  if (!isAliceFullRuntimeProfile(environment)) return action;

  const marked = action as T & { [ACTION_GUARDED]?: true };
  if (marked[ACTION_GUARDED] || isAliceFullGatedSafeActionName(action.name)) {
    return action;
  }
  const guarded = {
    ...action,
    validate: async () => true,
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
    runtime.actions[index] = enforceAliceActionExecutionBoundary(
      runtime.actions[index],
      environment,
    );
  }

  const marked = runtime as GuardableRuntime & {
    [RUNTIME_GUARD_INSTALLED]?: true;
  };
  if (
    marked[RUNTIME_GUARD_INSTALLED] ||
    typeof runtime.registerAction !== "function"
  ) {
    return;
  }
  const registerAction = runtime.registerAction.bind(runtime);
  runtime.registerAction = (action: Action): void => {
    registerAction(enforceAliceActionExecutionBoundary(action, environment));
  };
  Object.defineProperty(marked, RUNTIME_GUARD_INSTALLED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
