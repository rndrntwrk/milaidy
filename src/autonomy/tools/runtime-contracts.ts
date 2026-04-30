/**
 * Runtime action contract synthesis.
 *
 * Ensures every runtime action has a schema-validated tool contract,
 * even when no explicit contract file exists yet.
 *
 * @module autonomy/tools/runtime-contracts
 */

import { z } from "zod";
import type { CustomActionDef } from "../../config/types.milaidy.js";
import type { PluginPermission } from "../../plugins/permissions.js";
import { createCustomActionContract } from "./schemas/custom-action.schema.js";
import type {
  RiskClass,
  ToolContract,
  ToolRegistryInterface,
} from "./types.js";

type JsonLikeSchema = {
  type?: string;
  enum?: unknown[];
};

type RuntimeActionParameter = {
  name?: string;
  required?: boolean;
  schema?: JsonLikeSchema;
};

export type RuntimeActionLike = {
  name?: string;
  description?: string;
  parameters?: RuntimeActionParameter[];
};

export type RuntimeActionSource = {
  actions?: RuntimeActionLike[];
  getAllActions?: () => RuntimeActionLike[] | undefined;
};

export type RuntimeContractRegistration = {
  explicit: string[];
  synthesized: string[];
};

function inferRiskClass(actionName: string): RiskClass {
  const upper = actionName.toUpperCase();
  if (
    upper.startsWith("GET_") ||
    upper.startsWith("LIST_") ||
    upper.startsWith("READ_") ||
    upper.startsWith("QUERY_") ||
    upper.startsWith("SEARCH_") ||
    upper.startsWith("ANALYZE_")
  ) {
    return "read-only";
  }
  if (
    upper.includes("CREATE") ||
    upper.includes("UPDATE") ||
    upper.includes("GENERATE") ||
    upper.includes("PLAY") ||
    upper.includes("SEND")
  ) {
    return "reversible";
  }
  return "irreversible";
}

function inferPermissions(actionName: string): PluginPermission[] {
  const upper = actionName.toUpperCase();
  if (
    upper.includes("TERMINAL") ||
    upper.includes("SHELL") ||
    upper.includes("EXEC")
  ) {
    return ["process:shell"];
  }
  if (upper.includes("INSTALL")) {
    return ["process:spawn", "fs:write:workspace"];
  }
  if (upper.includes("HTTP") || upper.includes("FETCH")) {
    return ["net:outbound:https"];
  }
  if (upper.includes("WRITE") || upper.includes("SAVE")) {
    return ["fs:write:workspace"];
  }
  return [];
}

function schemaFromParameter(param: RuntimeActionParameter): z.ZodTypeAny {
  const rawSchema = param.schema;
  const enumValues = rawSchema?.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    const literals = enumValues.map((value) => z.literal(value));
    if (literals.length === 1) {
      return literals[0];
    }
    return z.union(literals as [z.ZodLiteral<unknown>, ...z.ZodLiteral<unknown>[]]);
  }

  switch (rawSchema?.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function buildParamsSchema(parameters: RuntimeActionParameter[] | undefined) {
  if (!Array.isArray(parameters) || parameters.length === 0) {
    return z.object({}).strict();
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const parameter of parameters) {
    const name = typeof parameter.name === "string" ? parameter.name.trim() : "";
    if (!name || shape[name]) continue;

    const zodSchema = schemaFromParameter(parameter);
    shape[name] = parameter.required ? zodSchema : zodSchema.optional();
  }

  return z.object(shape).strict();
}

/**
 * Build a synthesized ToolContract from runtime action metadata.
 *
 * Returns null for invalid/nameless actions.
 */
export function createRuntimeActionContract(
  action: RuntimeActionLike,
): ToolContract | null {
  const name = typeof action.name === "string" ? action.name.trim() : "";
  if (!name) return null;

  const riskClass = inferRiskClass(name);

  return {
    name,
    description:
      typeof action.description === "string" && action.description.trim().length > 0
        ? action.description
        : `Runtime action contract for ${name}`,
    version: "1.0.0",
    riskClass,
    paramsSchema: buildParamsSchema(action.parameters),
    requiredPermissions: inferPermissions(name),
    sideEffects:
      riskClass === "read-only"
        ? []
        : [
            {
              description: `Executes runtime action "${name}"`,
              resource: "runtime",
              reversible: riskClass === "reversible",
            },
          ],
    requiresApproval: riskClass === "irreversible",
    timeoutMs: 60_000,
    tags: ["runtime-generated"],
  };
}

/**
 * Register synthesized contracts for runtime actions that do not
 * already have an explicit contract in the registry.
 *
 * Returns the names of newly-registered contracts.
 */
export function registerRuntimeActionContracts(
  registry: ToolRegistryInterface,
  runtime: RuntimeActionSource | null | undefined,
): string[] {
  if (!runtime) return [];

  const actions = runtime.getAllActions?.() ?? runtime.actions ?? [];
  if (!Array.isArray(actions) || actions.length === 0) {
    return [];
  }

  const registered: string[] = [];
  for (const action of actions) {
    const name = typeof action?.name === "string" ? action.name.trim() : "";
    if (!name || registry.has(name)) continue;

    const contract = createRuntimeActionContract(action);
    if (!contract) continue;
    registry.register(contract);
    registered.push(contract.name);
  }

  return registered;
}

/**
 * Register explicit contracts for configured custom actions.
 *
 * These contracts use declared handler type and parameter metadata,
 * so they are preferred over synthesized runtime inference.
 */
export function registerConfiguredCustomActionContracts(
  registry: ToolRegistryInterface,
  customActions: CustomActionDef[] | null | undefined,
): string[] {
  if (!Array.isArray(customActions) || customActions.length === 0) {
    return [];
  }

  const registered: string[] = [];
  for (const action of customActions) {
    if (!action?.enabled) continue;
    const name = typeof action.name === "string" ? action.name.trim() : "";
    if (!name || registry.has(name)) continue;

    const contract = createCustomActionContract({
      name,
      description: action.description,
      handlerType: action.handler.type,
      parameters: action.parameters?.map((parameter) => ({
        name: parameter.name,
        required: parameter.required,
      })),
    });
    registry.register(contract);
    registered.push(contract.name);
  }

  return registered;
}

/**
 * Register both explicit (configured custom actions) and synthesized
 * (remaining runtime actions) contracts.
 */
export function registerRuntimeContracts(
  registry: ToolRegistryInterface,
  input: {
    runtime?: RuntimeActionSource | null;
    customActions?: CustomActionDef[] | null;
  },
): RuntimeContractRegistration {
  const explicit = registerConfiguredCustomActionContracts(
    registry,
    input.customActions,
  );
  const synthesized = registerRuntimeActionContracts(registry, input.runtime);
  return { explicit, synthesized };
}
