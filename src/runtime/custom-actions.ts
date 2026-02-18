/**
 * Custom Actions runtime loader.
 *
 * Converts `CustomActionDef[]` from config into ElizaOS `Action[]` objects
 * so the agent can use them in conversations.
 *
 * @module runtime/custom-actions
 */

import type { Action, HandlerOptions, IAgentRuntime } from "@elizaos/core";
import { createCustomActionContract } from "../autonomy/tools/schemas/custom-action.schema.js";
import type { ToolRegistryInterface } from "../autonomy/tools/types.js";
import { customActionPostConditions } from "../autonomy/verification/postconditions/custom-action.postcondition.js";
import { loadMilaidyConfig } from "../config/config.js";
import type {
  CustomActionDef,
  CustomActionHandler,
} from "../config/types.milaidy.js";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "./five55-capability-policy.js";
import { resolveFive55CapabilityForAction } from "./five55-capability-routing.js";

/** Cached runtime reference for hot-registration of new actions. */
let _runtime: IAgentRuntime | null = null;
const _customPostConditionsRegistered = new Set<string>();

type AutonomyServiceLike = {
  getToolRegistry?: () => ToolRegistryInterface | null;
  getPostConditionVerifier?: () => {
    registerConditions: (toolName: string, conditions: typeof customActionPostConditions) => void;
  } | null;
};

function syncCustomActionWithAutonomy(def: CustomActionDef): void {
  if (!_runtime) return;

  try {
    const autonomySvc = _runtime.getService?.("AUTONOMY") as
      | AutonomyServiceLike
      | null;
    if (!autonomySvc) return;

    const name = def.name.trim();
    if (!name) return;

    const registry = autonomySvc.getToolRegistry?.();
    if (registry && !registry.has(name)) {
      registry.register(
        createCustomActionContract({
          name,
          description: def.description,
          handlerType: def.handler.type,
          parameters: def.parameters.map((parameter) => ({
            name: parameter.name,
            required: parameter.required,
          })),
        }),
      );
    }

    const verifier = autonomySvc.getPostConditionVerifier?.();
    if (verifier && !_customPostConditionsRegistered.has(name)) {
      verifier.registerConditions(name, customActionPostConditions);
      _customPostConditionsRegistered.add(name);
    }
  } catch {
    // Non-fatal: custom action remains available in runtime even if autonomy
    // service sync is unavailable.
  }
}

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
  syncCustomActionWithAutonomy(def);
  return action;
}

/** API port for shell handler requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const FIVE55_CAPABILITY_POLICY = createFive55CapabilityPolicy();

/** Valid handler types that we actually support. */
const VALID_HANDLER_TYPES = new Set(["http", "shell", "code"]);

/**
 * Shell-escape a value so it can be safely interpolated into a shell command.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Check whether a URL targets a private/internal network (SSRF guard).
 * Blocks loopback, link-local, and RFC-1918 ranges except our own API.
 */
function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Allow requests to our own API (terminal/run endpoint etc.)
    if (
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1") &&
      parsed.port === String(API_PORT)
    ) {
      return false;
    }

    // Block common internal targets
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname === "[::1]" ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return true;
    }

    // Block RFC-1918 / link-local ranges
    const parts = hostname.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number);
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // link-local
    }

    return false;
  } catch {
    // Malformed URL — block it
    return true;
  }
}

/**
 * Build an async handler function from a CustomActionHandler definition.
 */
function buildHandler(
  handler: CustomActionHandler,
  paramDefs: CustomActionDef["parameters"],
): (
  params: Record<string, string>,
) => Promise<{ ok: boolean; output: string }> {
  if (!VALID_HANDLER_TYPES.has(handler.type)) {
    return async () => ({
      ok: false,
      output: `Unsupported handler type: ${handler.type}`,
    });
  }

  switch (handler.type) {
    case "http":
      return async (params) => {
        let url = handler.url;
        let body = handler.bodyTemplate ?? "";
        const headers: Record<string, string> = { ...handler.headers };

        // Substitute {{paramName}} placeholders
        // URL values get URI-encoded, body values are left raw (JSON context)
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          url = url.replaceAll(`{{${p.name}}}`, encodeURIComponent(value));
          body = body.replaceAll(`{{${p.name}}}`, value);
        }

        // SSRF guard — block requests to internal/private networks
        if (isBlockedUrl(url)) {
          return {
            ok: false,
            output:
              "Blocked: cannot make requests to internal network addresses",
          };
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
        // Shell-escape parameter values to prevent injection
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          command = command.replaceAll(`{{${p.name}}}`, shellEscape(value));
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
          return {
            ok: false,
            output: `Terminal request failed: HTTP ${response.status}`,
          };
        }

        return { ok: true, output: `Executed: ${command}` };
      };

    case "code":
      // NOTE: code handlers run user-authored code from local config with
      // the same privileges as the host process. This is intentional for a
      // desktop app — the owner wrote the code. We restrict the sandbox to
      // only expose `params` and `fetch`; no require/import/process/global.
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
        const requiredCapability = resolveFive55CapabilityForAction(
          def.name,
          def.description,
        );
        if (requiredCapability) {
          assertFive55Capability(FIVE55_CAPABILITY_POLICY, requiredCapability);
        }

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
): (
  params: Record<string, string>,
) => Promise<{ ok: boolean; output: string }> {
  return buildHandler(def.handler, def.parameters);
}
