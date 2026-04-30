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
const SWAP_API_ENV = "SWAP_API_URL";

const swapProvider: Provider = {
  name: "swap",
  description: "Swap + wallet execution surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[SWAP_API_ENV]?.trim());
    return {
      text: [
        "## Swap Surface",
        "",
        "Use swap actions for quotes, execution, and wallet position checks.",
        `API configured: ${configured ? "yes" : "no"} (${SWAP_API_ENV})`,
        "Actions: SWAP_QUOTE, SWAP_EXECUTE, WALLET_POSITION",
      ].join("\n"),
    };
  },
};

const swapQuoteAction: Action = {
  name: "SWAP_QUOTE",
  similes: ["GET_SWAP_QUOTE", "QUOTE_SWAP"],
  description:
    "Fetches a swap quote for a wallet-aware token pair and amount.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "wallet.read_balance");
      const fromToken = readParam(options as HandlerOptions | undefined, "fromToken");
      const toToken = readParam(options as HandlerOptions | undefined, "toToken");
      const amount = readParam(options as HandlerOptions | undefined, "amount");
      const chain = readParam(options as HandlerOptions | undefined, "chain");
      return executeApiAction({
        module: "swap",
        action: "SWAP_QUOTE",
        base: requireApiBase(SWAP_API_ENV),
        endpoint: "/v1/sw4p/quote",
        payload: {
          fromToken,
          toToken,
          amount,
          chain: chain ?? "solana",
        },
        requestContract: {
          fromToken: { required: true, type: "string", nonEmpty: true },
          toToken: { required: true, type: "string", nonEmpty: true },
          amount: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^\d+(\.\d+)?$/,
          },
          chain: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["solana", "evm"],
          },
        },
        responseContract: {},
        successMessage: "swap quote fetched",
        transport: {
          service: "sw4p",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("swap", "SWAP_QUOTE", err);
    }
  },
  parameters: [
    {
      name: "fromToken",
      description: "Source token symbol/address",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "toToken",
      description: "Destination token symbol/address",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: "Input amount in token units",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "chain",
      description: "Chain namespace (solana|evm)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const swapExecuteAction: Action = {
  name: "SWAP_EXECUTE",
  similes: ["EXECUTE_SWAP", "SUBMIT_SWAP", "RUN_SWAP"],
  description:
    "Executes an approved swap quote. Subject to wallet transfer policy gates.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "wallet.prepare_transfer");
      const quoteId = readParam(options as HandlerOptions | undefined, "quoteId");
      const slippageBps = readParam(
        options as HandlerOptions | undefined,
        "slippageBps",
      );
      return executeApiAction({
        module: "swap",
        action: "SWAP_EXECUTE",
        base: requireApiBase(SWAP_API_ENV),
        endpoint: "/v1/sw4p/execute",
        payload: {
          quoteId,
          slippageBps: slippageBps ?? "50",
        },
        requestContract: {
          quoteId: { required: true, type: "string", nonEmpty: true },
          slippageBps: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^\d+$/,
          },
        },
        responseContract: {},
        successMessage: "swap execution submitted",
        transport: {
          service: "sw4p",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction("swap", "SWAP_EXECUTE", err);
    }
  },
  parameters: [
    {
      name: "quoteId",
      description: "Quote identifier returned by SWAP_QUOTE",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "slippageBps",
      description: "Maximum slippage in basis points",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const walletPositionAction: Action = {
  name: "WALLET_POSITION",
  similes: ["WALLET_POSITION", "GET_WALLET_POSITION", "BALANCE_SNAPSHOT"],
  description:
    "Returns wallet balances and position snapshot for swap and rewards planning.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "wallet.read_balance");
      const chain = readParam(options as HandlerOptions | undefined, "chain");
      return executeApiAction({
        module: "swap",
        action: "WALLET_POSITION",
        base: requireApiBase(SWAP_API_ENV),
        endpoint: "/v1/wallet/position",
        payload: {
          chain: chain ?? "all",
        },
        requestContract: {
          chain: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["solana", "evm", "all"],
          },
        },
        responseContract: {},
        successMessage: "wallet position fetched",
        transport: {
          service: "wallet",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction("swap", "WALLET_POSITION", err);
    }
  },
  parameters: [
    {
      name: "chain",
      description: "Optional chain selector (solana|evm|all)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createSwapPlugin(): Plugin {
  return {
    name: "swap",
    description: "Swap + wallet bridge for execution and projections",
    providers: [swapProvider],
    actions: [swapQuoteAction, swapExecuteAction, walletPositionAction],
  };
}

export default createSwapPlugin;
