import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { ModelType, parseJSONObjectFromText } from "@elizaos/core";

type ParamRecord = Record<string, unknown>;

export type ActionParamSchemaEntry = {
  name?: string;
  type?: string;
  description?: string;
  required?: boolean;
  enum?: readonly unknown[];
  options?: readonly unknown[];
  values?: readonly unknown[];
};

export type ExtractActionParamsArgs<TParams extends ParamRecord> = {
  runtime: IAgentRuntime;
  message: Memory;
  state?: State;
  actionName: string;
  actionDescription?: string;
  paramSchema?: readonly ActionParamSchemaEntry[] | readonly unknown[];
  existingParams?: Partial<TParams> | ParamRecord;
  requiredFields?: readonly (keyof TParams | string)[];
};

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

function messageContentParams(message: Memory): ParamRecord {
  const content = message.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return {};
  }
  return content as ParamRecord;
}

function messageText(message: Memory): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const text = (content as ParamRecord).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function mergeDefined(base: ParamRecord, patch: ParamRecord): ParamRecord {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPresent(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function missingRequiredFields(
  params: ParamRecord,
  requiredFields: readonly (string | number | symbol)[],
): string[] {
  return requiredFields
    .map(String)
    .filter((field) => !isPresent(params[field]));
}

function buildPrompt(args: {
  actionName: string;
  actionDescription: string;
  paramSchema: readonly unknown[];
  existingParams: ParamRecord;
  requiredFields: readonly string[];
  userText: string;
}): string {
  return [
    "Extract action parameters from the user message.",
    "Return ONLY a JSON object. Do not include prose or markdown.",
    "Preserve existing parameters unless the user clearly supplied a better value.",
    "Use null only when a field cannot be inferred.",
    "",
    `Action: ${args.actionName}`,
    `Description: ${args.actionDescription || "(none)"}`,
    `Parameter schema: ${JSON.stringify(args.paramSchema)}`,
    `Required fields: ${JSON.stringify(args.requiredFields)}`,
    `Existing parameters: ${JSON.stringify(args.existingParams)}`,
    `User message: ${JSON.stringify(args.userText)}`,
  ].join("\n");
}

export async function extractActionParamsViaLlm<
  TParams extends ParamRecord = ParamRecord,
>(args: ExtractActionParamsArgs<TParams>): Promise<TParams> {
  const contentParams = messageContentParams(args.message);
  const existingParams = mergeDefined(
    contentParams,
    (args.existingParams ?? {}) as ParamRecord,
  );
  const requiredFields = (args.requiredFields ?? []).map(String);

  if (
    missingRequiredFields(existingParams, requiredFields).length === 0 ||
    typeof args.runtime.useModel !== "function"
  ) {
    return existingParams as TParams;
  }

  const prompt = buildPrompt({
    actionName: args.actionName,
    actionDescription: args.actionDescription ?? "",
    paramSchema: args.paramSchema ?? [],
    existingParams,
    requiredFields,
    userText: messageText(args.message),
  });

  try {
    const result = await args.runtime.useModel(ModelType.TEXT_LARGE, {
      prompt,
    });
    const raw = typeof result === "string" ? result : "";
    const parsed = parseJSONObjectFromText(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return existingParams as TParams;
    }
    return mergeDefined(existingParams, parsed as ParamRecord) as TParams;
  } catch {
    return existingParams as TParams;
  }
}
