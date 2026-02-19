import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "../../runtime/five55-capability-policy.js";
import {
  exceptionAction,
  executeApiAction,
  readParam,
  requireApiBase,
} from "../five55-shared/action-kit.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_BATTLES_API_URL";
const CREATE_ENDPOINT_ENV = "FIVE55_BATTLES_CREATE_ENDPOINT";
const DEFAULT_CREATE_ENDPOINT = "/battle/create";

function resolveCreateEndpoint(): string {
  const configured = process.env[CREATE_ENDPOINT_ENV]?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_CREATE_ENDPOINT;
}

function parseMetadata(raw: string | undefined): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  const trimmed = raw.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback to plain text below.
  }
  return { note: trimmed };
}

const battlesProvider: Provider = {
  name: "five55Battles",
  description: "Five55 battle state and resolution surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Battles Surface",
        "",
        "Actions: FIVE55_BATTLES_READ, FIVE55_BATTLES_CREATE, FIVE55_BATTLES_RESOLVE",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
        `Create endpoint: ${resolveCreateEndpoint()}`,
      ].join("\n"),
    };
  },
};

const readAction: Action = {
  name: "FIVE55_BATTLES_READ",
  similes: ["READ_BATTLES", "LIST_BATTLES"],
  description: "Reads active/pending battle records.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "battles.read");
      const status = readParam(options as HandlerOptions | undefined, "status");
      return executeApiAction({
        module: "five55.battles",
        action: "FIVE55_BATTLES_READ",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/battles/read",
        payload: {
          status: status ?? "active",
        },
        requestContract: {
          status: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["active", "pending", "resolved", "all"],
          },
        },
        responseContract: {},
        successMessage: "battles fetched",
        transport: {
          service: "battles",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("five55.battles", "FIVE55_BATTLES_READ", err);
    }
  },
  parameters: [
    {
      name: "status",
      description: "Battle status filter (active|pending|resolved|all)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const createAction: Action = {
  name: "FIVE55_BATTLES_CREATE",
  similes: [
    "CREATE_BATTLE",
    "START_BATTLE",
    "DUEL_USER",
    "CREATE_CHALLENGE",
    "CHALLENGE_USER",
  ],
  description:
    "Creates a 1v1 or open battle challenge and emits metadata for downstream scoring.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "battles.create");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const targetId =
        readParam(options as HandlerOptions | undefined, "targetId") ?? "OPEN";
      const wagerRaw =
        readParam(options as HandlerOptions | undefined, "wager") ?? "100";
      const currencyMint =
        readParam(options as HandlerOptions | undefined, "currencyMint") ?? "";
      const metadataRaw = readParam(
        options as HandlerOptions | undefined,
        "metadata",
      );

      const wagerAmount = Number.parseInt(wagerRaw, 10);
      if (!Number.isFinite(wagerAmount) || wagerAmount < 0) {
        throw new Error("wager must be a non-negative integer");
      }

      return executeApiAction({
        module: "five55.battles",
        action: "FIVE55_BATTLES_CREATE",
        base: requireApiBase(API_ENV),
        endpoint: resolveCreateEndpoint(),
        payload: {
          game_id: gameId,
          target_id: targetId,
          wager_amount: wagerAmount,
          currency_mint: currencyMint,
          metadata: parseMetadata(metadataRaw),
        },
        requestContract: {
          game_id: { required: true, type: "string", nonEmpty: true },
          target_id: { required: true, type: "string", nonEmpty: true },
          wager_amount: { required: true, type: "number" },
          currency_mint: { required: false, type: "string" },
          metadata: { required: false, type: "object" },
        },
        responseContract: {},
        successMessage: "battle challenge created",
        transport: {
          service: "battles",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("five55.battles", "FIVE55_BATTLES_CREATE", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Canonical game identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "targetId",
      description: "Target user/wallet identifier (defaults to OPEN)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "wager",
      description: "Wager amount (integer points/credits)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "currencyMint",
      description: "Optional token mint address for wager settlement",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "metadata",
      description: "Optional JSON metadata object as string",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const resolveAction: Action = {
  name: "FIVE55_BATTLES_RESOLVE",
  similes: ["RESOLVE_BATTLE", "SETTLE_BATTLE"],
  description: "Resolves battle outcome and emits downstream scoring events.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "battles.resolve");
      const battleId = readParam(
        options as HandlerOptions | undefined,
        "battleId",
      );
      const winnerId = readParam(
        options as HandlerOptions | undefined,
        "winnerId",
      );
      return executeApiAction({
        module: "five55.battles",
        action: "FIVE55_BATTLES_RESOLVE",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/battles/resolve",
        payload: { battleId, winnerId },
        requestContract: {
          battleId: { required: true, type: "string", nonEmpty: true },
          winnerId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "battle resolved",
        transport: {
          service: "battles",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("five55.battles", "FIVE55_BATTLES_RESOLVE", err);
    }
  },
  parameters: [
    {
      name: "battleId",
      description: "Battle identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "winnerId",
      description: "Winning player/agent identifier",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55BattlesPlugin(): Plugin {
  return {
    name: "five55-battles",
    description: "Five55 battles challenge + resolution plugin",
    providers: [battlesProvider],
    actions: [readAction, createAction, resolveAction],
  };
}

export default createFive55BattlesPlugin;
