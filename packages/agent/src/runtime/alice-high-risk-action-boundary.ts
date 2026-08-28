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

function guardAction(action: Action): Action {
  const marked = action as Action & { [ACTION_GUARDED]?: true };
  if (marked[ACTION_GUARDED] || isAliceFullGatedSafeActionName(action.name)) {
    return action;
  }
  action.handler = async (...args: Parameters<Action["handler"]>) => {
    const text = `ALICE_HIGH_RISK_ACTION_DENIED: ${action.name} requires an independently verified capability grant.`;
    const callback = args[4];
    if (callback) {
      await callback({
        text,
        action: "ALICE_HIGH_RISK_ACTION_DENIED",
      } as Content);
    }
    return { success: false, text, error: "ALICE_HIGH_RISK_ACTION_DENIED" };
  };
  Object.defineProperty(marked, ACTION_GUARDED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return action;
}

export function installAliceHighRiskActionBoundary(
  runtime: GuardableRuntime,
  environment: AliceRuntimeProfileEnv = process.env,
): void {
  if (!isAliceFullRuntimeProfile(environment)) return;
  for (const action of runtime.actions) guardAction(action);

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
    registerAction(guardAction(action));
  };
  Object.defineProperty(marked, RUNTIME_GUARD_INSTALLED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
