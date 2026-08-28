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

function actionTokens(name: string): Set<string> {
  return new Set(
    name
      .trim()
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );
}

export function isAliceHighRiskActionName(name: string): boolean {
  const tokens = actionTokens(name);
  if (
    [
      "ADMIN",
      "CREDENTIAL",
      "SECRET",
      "TRANSFER",
      "TRADE",
      "SWAP",
      "WITHDRAW",
      "BRIDGE",
      "SIGN",
      "DEPLOY",
      "MERGE",
      "RELEASE",
      "PROMOTE",
      "ROLLBACK",
      "PUBLISH",
      "POST",
      "TWEET",
    ].some((token) => tokens.has(token))
  ) {
    return true;
  }
  if (
    tokens.has("SEND") &&
    ["MESSAGE", "TOKEN", "FUNDS", "COIN", "TWEET"].some((token) =>
      tokens.has(token),
    )
  ) {
    return true;
  }
  if (
    tokens.has("RISK") &&
    ["INCREASE", "RAISE", "CHANGE", "SET", "UPDATE", "MODIFY"].some((token) =>
      tokens.has(token),
    )
  ) {
    return true;
  }
  if (
    (tokens.has("GO") &&
      ["LIVE", "ONLINE", "OFFLINE"].some((token) => tokens.has(token))) ||
    (["STREAM", "BROADCAST"].some((token) => tokens.has(token)) &&
      ["START", "PUBLIC", "PUBLISH", "LIVE"].some((t) => tokens.has(t)))
  ) {
    return true;
  }
  if (
    ["SHELL", "TERMINAL", "SANDBOX"].some((token) => tokens.has(token)) ||
    (tokens.has("SKILL") &&
      ["COMMAND", "RUN", "EXECUTE"].some((token) => tokens.has(token))) ||
    (tokens.has("ROLE") &&
      ["UPDATE", "SET", "ADD", "REMOVE", "DELETE"].some((token) =>
        tokens.has(token),
      )) ||
    (tokens.has("APP") &&
      ["LAUNCH", "START", "STOP"].some((token) => tokens.has(token))) ||
    (tokens.has("AGENT") && tokens.has("RESTART"))
  ) {
    return true;
  }
  return tokens.has("GMAIL") && tokens.has("ACTION");
}

function guardAction(action: Action): Action {
  const marked = action as Action & { [ACTION_GUARDED]?: true };
  if (marked[ACTION_GUARDED] || !isAliceHighRiskActionName(action.name)) {
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
