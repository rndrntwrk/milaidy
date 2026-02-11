/**
 * Custom Actions runtime loader.
 *
 * Converts `CustomActionDef[]` from config into ElizaOS `Action[]` objects
 * so the agent can use them in conversations.
 *
 * @module runtime/custom-actions
 */

import type { Action, HandlerOptions, IAgentRuntime } from "@elizaos/core";
import type { CustomActionDef, CustomActionHandler } from "../config/types.milaidy.js";
import { loadMilaidyConfig } from "../config/config.js";

/** Cached runtime reference for hot-registration of new actions. */
let _runtime: IAgentRuntime | null = null;

/**
 * Store the runtime reference so we can hot-register actions later.
 * Called once from plugin.init().
 */
export function setCustomActionsRuntime(runtime: IAgentRuntime): void {
  _runtime = runtime;
}

/**
 * Hot-register a CustomActionDef into the running agent.
 * Returns the ElizaOS Action that was registered, or null if no runtime.
 */
export function registerCustomActionLive(def: CustomActionDef): Action | null {
  if (!_runtime) return null;
  const action = defToAction(def);
  _runtime.registerAction(action);
  return action;
}

/** API port for shell handler requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

/**
 * Build an async handler function from a CustomActionHandler definition.
 */
function buildHandler(
  handler: CustomActionHandler,
  paramDefs: CustomActionDef["parameters"],
): (params: Record<string, string>) => Promise<{ ok: boolean; output: string }> {
  switch (handler.type) {
    case "http":
      return async (params) => {
        let url = handler.url;
        let body = handler.bodyTemplate ?? "";
        const headers: Record<string, string> = { ...handler.headers };

        // Substitute {{paramName}} placeholders
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          url = url.replaceAll(`{{${p.name}}}`, value);
          body = body.replaceAll(`{{${p.name}}}`, value);
        }

        if (!headers["Content-Type"] && body) {
          headers["Content-Type"] = "application/json";
        }

        const fetchOpts: RequestInit = {
          method: handler.method || "GET",
          headers,
        };
        if (body && handler.method !== "GET" && handler.method !== "HEAD") {
          fetchOpts.body = body;
        }

        const response = await fetch(url, fetchOpts);
        const text = await response.text();
        return { ok: response.ok, output: text.slice(0, 4000) };
      };

    case "shell":
      return async (params) => {
        let command = handler.command;
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          command = command.replaceAll(`{{${p.name}}}`, value);
        }

        const response = await fetch(
          `http://localhost:${API_PORT}/api/terminal/run`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
          },
        );

        if (!response.ok) {
          return { ok: false, output: `Terminal request failed: HTTP ${response.status}` };
        }

        return { ok: true, output: `Executed: ${command}` };
      };

    case "code":
      return async (params) => {
        const fn = new Function(
          "params",
          "fetch",
          `"use strict"; return (async () => { ${handler.code} })();`,
        );
        const result = await fn(params, fetch);
        const output = result !== undefined ? String(result) : "Done";
        return { ok: true, output: output.slice(0, 4000) };
      };

    default:
      return async () => ({ ok: false, output: "Unknown handler type" });
  }
}

/**
 * Convert a single CustomActionDef into an ElizaOS Action.
 */
function defToAction(def: CustomActionDef): Action {
  const handler = buildHandler(def.handler, def.parameters);

  return {
    name: def.name,
    similes: def.similes ?? [],
    description: def.description,
    validate: async () => true,

    handler: async (_runtime, _message, _state, options) => {
      try {
        const opts = options as HandlerOptions | undefined;
        const params: Record<string, string> = {};

        for (const p of def.parameters) {
          const value = opts?.parameters?.[p.name];
          if (typeof value === "string") {
            params[p.name] = value;
          } else if (value !== undefined && value !== null) {
            params[p.name] = String(value);
          } else if (p.required) {
            return {
              text: `Missing required parameter: ${p.name}`,
              success: false,
            };
          }
        }

        const result = await handler(params);
        return {
          text: result.output,
          success: result.ok,
          data: { actionId: def.id, params },
        };
      } catch (err) {
        return {
          text: `Action failed: ${err instanceof Error ? err.message : String(err)}`,
          success: false,
        };
      }
    },

    parameters: def.parameters.map((p) => ({
      name: p.name,
      description: p.description,
      required: p.required,
      schema: { type: "string" as const },
    })),
  };
}

/**
 * Load custom actions from config and convert them to ElizaOS Action objects.
 * Only returns enabled actions.
 */
export function loadCustomActions(): Action[] {
  try {
    const config = loadMilaidyConfig();
    const defs = config.customActions ?? [];
    return defs.filter((d) => d.enabled).map(defToAction);
  } catch {
    return [];
  }
}

/**
 * Build a temporary handler for testing a custom action definition.
 * Used by the test endpoint to execute an action with sample params.
 */
export function buildTestHandler(
  def: CustomActionDef,
): (params: Record<string, string>) => Promise<{ ok: boolean; output: string }> {
  return buildHandler(def.handler, def.parameters);
}
