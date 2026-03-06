/**
 * JSONL Exporter — exports training traces to JSONL format for fine-tuning.
 *
 * @module autonomy/learning/export/jsonl-exporter
 */

import type { TrainingDataset, TrainingExample } from "../types.js";

type LegacyTrainingExample = {
  id: string;
  toolName: string;
  userInput?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  reward?: number;
  source?: string;
  scenarioId?: string;
  systemPrompt?: string;
};

type LegacyTrainingDataset = {
  examples?: LegacyTrainingExample[];
};

/** Options for JSONL export. */
export interface JsonlExportOptions {
  /** Minimum reward threshold to include an example. Default: 0. */
  minReward?: number;
  /** Maximum number of examples. Default: unlimited. */
  maxExamples?: number;
  /** Whether to include metadata fields. Default: true. */
  includeMetadata?: boolean;
}

/** A single JSONL line for tool-call fine-tuning. */
export interface JsonlToolCallLine {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
  reward?: number;
}

interface NormalizedTrainingExample {
  id: string;
  toolName: string;
  systemPrompt?: string;
  userContent: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
  reward: number;
  source?: string;
  requestId?: string;
  agentId?: string;
  timestamp?: number;
}

function isLegacyTrainingExample(
  example: TrainingExample | LegacyTrainingExample,
): example is LegacyTrainingExample {
  return "userInput" in example || "toolInput" in example;
}

function normalizeTrainingExample(
  example: TrainingExample | LegacyTrainingExample,
): NormalizedTrainingExample {
  if (isLegacyTrainingExample(example)) {
    return {
      id: example.id,
      toolName: example.toolName,
      systemPrompt: example.systemPrompt,
      userContent: example.userInput ?? "",
      toolInput: example.toolInput ?? {},
      toolOutput: example.toolOutput ?? {},
      reward: typeof example.reward === "number" ? example.reward : 0,
      source: example.source,
      requestId: example.scenarioId,
    };
  }

  return {
    id: example.id,
    toolName: example.toolName,
    userContent: JSON.stringify({
      source: example.input.source,
      params: example.input.params,
    }),
    toolInput: example.input.params ?? {},
    toolOutput: example.output.result ?? {},
    reward: example.reward.total,
    source: example.input.source,
    requestId: example.metadata.requestId,
    agentId: example.metadata.agentId,
    timestamp: example.metadata.timestamp,
  };
}

/**
 * Convert a TrainingExample to a JSONL-compatible chat format line.
 */
export function exampleToJsonlLine(
  example: TrainingExample | LegacyTrainingExample,
  includeMetadata = true,
): JsonlToolCallLine {
  const normalized = normalizeTrainingExample(example);
  const messages: JsonlToolCallLine["messages"] = [];
  if (normalized.systemPrompt) {
    messages.push({ role: "system", content: normalized.systemPrompt });
  }
  messages.push({ role: "user", content: normalized.userContent });

  messages.push({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: `call_${normalized.id}`,
        type: "function",
        function: {
          name: normalized.toolName,
          arguments: JSON.stringify(normalized.toolInput),
        },
      },
    ],
  });

  const line: JsonlToolCallLine = { messages };

  if (includeMetadata) {
    line.reward = normalized.reward;
  }

  return line;
}

function getExamples(
  dataset: TrainingDataset | LegacyTrainingDataset,
): Array<TrainingExample | LegacyTrainingExample> {
  if ("episodes" in dataset && Array.isArray(dataset.episodes)) {
    return dataset.episodes.flatMap((episode) => episode.steps);
  }
  if ("examples" in dataset && Array.isArray(dataset.examples)) {
    return dataset.examples;
  }
  return [];
}

/**
 * Export a TrainingDataset to JSONL string (one JSON object per line).
 */
export function exportDatasetToJsonl(
  dataset: TrainingDataset | LegacyTrainingDataset,
  options: JsonlExportOptions = {},
): string {
  const { minReward = 0, maxExamples, includeMetadata = true } = options;

  let examples = getExamples(dataset).filter(
    (ex) => normalizeTrainingExample(ex).reward >= minReward,
  );

  if (maxExamples != null && maxExamples > 0) {
    examples = examples.slice(0, maxExamples);
  }

  return examples
    .map((ex) => JSON.stringify(exampleToJsonlLine(ex, includeMetadata)))
    .join("\n");
}

/**
 * Export to HuggingFace dataset format (JSONL with specific field names).
 */
export function exportToHuggingFace(
  dataset: TrainingDataset | LegacyTrainingDataset,
  options: JsonlExportOptions = {},
): string {
  const { minReward = 0, maxExamples, includeMetadata = true } = options;

  let examples = getExamples(dataset).filter(
    (ex) => normalizeTrainingExample(ex).reward >= minReward,
  );

  if (maxExamples != null && maxExamples > 0) {
    examples = examples.slice(0, maxExamples);
  }

  return examples
    .map((ex) => {
      const normalized = normalizeTrainingExample(ex);
      const row: Record<string, unknown> = {
        id: normalized.id,
        instruction: normalized.userContent,
        tool_name: normalized.toolName,
        tool_input: normalized.toolInput,
        tool_output: normalized.toolOutput,
        reward: normalized.reward,
      };
      if (includeMetadata) {
        row.source = normalized.source;
        row.request_id = normalized.requestId;
        row.agent_id = normalized.agentId;
        row.timestamp = normalized.timestamp;
      }
      return JSON.stringify(row);
    })
    .join("\n");
}
