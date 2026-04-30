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
const API_ENV = "FIVE55_SCORE_CAPTURE_API_URL";

const scoreProvider: Provider = {
  name: "five55ScoreCapture",
  description: "Five55 score capture and submit surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const configured = Boolean(process.env[API_ENV]?.trim());
    return {
      text: [
        "## Five55 Score Capture Surface",
        "",
        "Actions: FIVE55_SCORE_CAPTURE_READ, FIVE55_SCORE_CAPTURE_SUBMIT",
        `API configured: ${configured ? "yes" : "no"} (${API_ENV})`,
      ].join("\n"),
    };
  },
};

const readScoreAction: Action = {
  name: "FIVE55_SCORE_CAPTURE_READ",
  similes: ["READ_SCORE_CAPTURE", "GET_CAPTURED_SCORE"],
  description: "Reads the latest captured score for a game session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.capture_score");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const sessionId = readParam(options as HandlerOptions | undefined, "sessionId");
      return executeApiAction({
        module: "five55.score_capture",
        action: "FIVE55_SCORE_CAPTURE_READ",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/score-capture/read",
        payload: { gameId, sessionId },
        requestContract: {
          gameId: { required: true, type: "string", nonEmpty: true },
          sessionId: { required: true, type: "string", nonEmpty: true },
        },
        responseContract: {},
        successMessage: "captured score fetched",
        transport: {
          service: "score_capture",
          operation: "query",
        },
      });
    } catch (err) {
      return exceptionAction(
        "five55.score_capture",
        "FIVE55_SCORE_CAPTURE_READ",
        err,
      );
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
      name: "sessionId",
      description: "Game session identifier",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

const submitScoreAction: Action = {
  name: "FIVE55_SCORE_CAPTURE_SUBMIT",
  similes: ["SUBMIT_CAPTURED_SCORE", "WRITE_SCORE_CAPTURE"],
  description:
    "Submits validated captured score for leaderboard and points workflows.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.submit_score");
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const sessionId = readParam(options as HandlerOptions | undefined, "sessionId");
      const score = readParam(options as HandlerOptions | undefined, "score");
      return executeApiAction({
        module: "five55.score_capture",
        action: "FIVE55_SCORE_CAPTURE_SUBMIT",
        base: requireApiBase(API_ENV),
        endpoint: "/v1/score-capture/submit",
        payload: { gameId, sessionId, score },
        requestContract: {
          gameId: { required: true, type: "string", nonEmpty: true },
          sessionId: { required: true, type: "string", nonEmpty: true },
          score: {
            required: true,
            type: "string",
            nonEmpty: true,
            pattern: /^-?\d+(\.\d+)?$/,
          },
        },
        responseContract: {},
        successMessage: "captured score submitted",
        transport: {
          service: "score_capture",
          operation: "command",
          idempotent: true,
        },
      });
    } catch (err) {
      return exceptionAction(
        "five55.score_capture",
        "FIVE55_SCORE_CAPTURE_SUBMIT",
        err,
      );
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
      name: "sessionId",
      description: "Game session identifier",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "score",
      description: "Score value to submit",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55ScoreCapturePlugin(): Plugin {
  return {
    name: "five55-score-capture",
    description: "Five55 score capture normalization plugin",
    providers: [scoreProvider],
    actions: [readScoreAction, submitScoreAction],
  };
}

export default createFive55ScoreCapturePlugin;
