import type { ScenarioFinalCheck } from "@elizaos/scenario-schema";
import { scenario } from "@elizaos/scenario-schema";
import {
  expectConnectorDispatch,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

type ConnectorTurnConfig = {
  name: string;
  text: string;
  responseIncludesAny: Array<string | RegExp>;
  acceptedActions: string[];
  includesAny?: Array<string | RegExp>;
  /**
   * Optional per-turn LLM judge rubric. If omitted, the factory derives a
   * default rubric for the *first* turn so every certification scenario has
   * at least one rubric assertion (WS8 contract).
   */
  responseJudge?: { rubric: string; minimumScore?: number };
};

type ConnectorCertificationScenarioConfig = {
  id: string;
  title: string;
  connector: string;
  /**
   * The native channel name the connector dispatches against. If omitted the
   * factory falls back to `connector` for the side-effect assertion.
   */
  dispatchChannel?: string;
  tags?: string[];
  description: string;
  roomSource?: string;
  turns: ConnectorTurnConfig[];
  finalChecks?: ScenarioFinalCheck[];
};

export function buildConnectorCertificationScenario(
  config: ConnectorCertificationScenarioConfig,
) {
  const acceptedActions = Array.from(
    new Set(config.turns.flatMap((turn) => turn.acceptedActions)),
  );
  const includesAny = config.turns.flatMap((turn) => turn.includesAny ?? []);
  const dispatchChannel = config.dispatchChannel ?? config.connector;

  return scenario({
    id: config.id,
    title: config.title,
    domain: "connector-certification",
    tags: ["connector-certification", config.connector, ...(config.tags ?? [])],
    description: config.description,
    isolation: "per-scenario",
    requires: {
      plugins: ["@elizaos/plugin-agent-skills"],
    },
    rooms: [
      {
        id: "main",
        source: config.roomSource ?? "dashboard",
        channelType: "DM",
        title: config.title,
      },
    ],
    turns: config.turns.map((turn, index) => ({
      kind: "message",
      name: turn.name,
      room: "main",
      text: turn.text,
      assertTurn: expectTurnToCallAction({
        acceptedActions: turn.acceptedActions,
        description: `${config.connector} connector step "${turn.name}"`,
        includesAny: turn.includesAny,
      }),
      responseIncludesAny: turn.responseIncludesAny,
      // Every certification scenario needs at least one judge-rubric assertion.
      // Use the explicit rubric if the caller supplied one; otherwise derive a
      // baseline rubric from the connector + turn intent for the first turn.
      responseJudge:
        turn.responseJudge ??
        (index === 0
          ? {
              minimumScore: 0.7,
              rubric: `The reply must demonstrate the assistant is exercising the ${config.connector} connector for the step "${turn.name}". It should reference the actual operation (read/draft/send/upload/etc.) the user requested, not a generic acknowledgement, and must not silently swallow connector failures.`,
            }
          : undefined),
    })),
    finalChecks: [
      // Action-shape assertion: the right action was selected.
      {
        type: "selectedAction",
        actionName: acceptedActions,
      },
      ...(config.finalChecks ?? []),
      // Side-effect assertion: the connector dispatcher actually fired for
      // the connector's channel. This is the real proof of liveness — text
      // patterns alone don't prove the connector ran.
      {
        type: "connectorDispatchOccurred",
        channel: dispatchChannel,
        actionName: acceptedActions,
      },
      // Action-shape side-effect coverage predicate.
      {
        type: "custom",
        name: `${config.id}-action-coverage`,
        predicate: expectScenarioToCallAction({
          acceptedActions,
          description: `${config.connector} connector certification`,
          includesAny,
        }),
      },
      // Connector-dispatch typed predicate: same data the runner-level
      // `connectorDispatchOccurred` final check inspects, but enforced via the
      // typed helper so the contract test can verify shape on read.
      {
        type: "custom",
        name: `${config.id}-dispatch-side-effect`,
        predicate: expectConnectorDispatch({
          channel: dispatchChannel,
          actionName: acceptedActions,
          description: `${config.connector} connector dispatch side-effect`,
        }),
      },
      // LLM-judge rubric on the overall scenario outcome. The runner picks
      // this up via the `judgeRubric` typed final check.
      judgeRubric({
        name: `${config.id}-rubric`,
        threshold: 0.7,
        description: `End-to-end check: did the assistant actually exercise the ${config.connector} connector for the certification flow described as "${config.description}"? Score high only when the connector was used end-to-end (read, draft, send, hold, or whatever the certification calls for) and any failure was surfaced explicitly.`,
      }),
    ],
  });
}
