/**
 * JSONL Exporter — exports training traces to JSONL format for fine-tuning.
 *
 * @module autonomy/learning/export/jsonl-exporter
 */

import type { TrainingExample, TrainingDataset } from "../types.js";

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

/**
 * Convert a TrainingExample to a JSONL-compatible chat format line.
 */
export function exampleToJsonlLine(
  example: TrainingExample,
  includeMetadata = true,
): JsonlToolCallLine {
  const messages: JsonlToolCallLine["messages"] = [];

  if (example.systemPrompt) {
    messages.push({ role: "system", content: example.systemPrompt });
  }

  messages.push({ role: "user", content: example.userInput ?? "" });

  messages.push({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: `call_${example.id}`,
        type: "function",
        function: {
          name: example.toolName,
          arguments: JSON.stringify(example.toolInput ?? {}),
        },
      },
    ],
  });

  const line: JsonlToolCallLine = { messages };

  if (includeMetadata && example.reward !== undefined) {
    line.reward = example.reward;
  }

  return line;
}

/**
 * Export a TrainingDataset to JSONL string (one JSON object per line).
 */
export function exportDatasetToJsonl(
  dataset: TrainingDataset,
  options: JsonlExportOptions = {},
): string {
  const { minReward = 0, maxExamples, includeMetadata = true } = options;

  let examples = dataset.examples.filter(
    (ex) => (ex.reward ?? 0) >= minReward,
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
  dataset: TrainingDataset,
  options: JsonlExportOptions = {},
): string {
  const { minReward = 0, maxExamples, includeMetadata = true } = options;

  let examples = dataset.examples.filter(
    (ex) => (ex.reward ?? 0) >= minReward,
  );

  if (maxExamples != null && maxExamples > 0) {
    examples = examples.slice(0, maxExamples);
  }

  return examples
    .map((ex) => {
      const row: Record<string, unknown> = {
        id: ex.id,
        instruction: ex.userInput ?? "",
        tool_name: ex.toolName,
        tool_input: ex.toolInput ?? {},
        tool_output: ex.toolOutput ?? {},
        reward: ex.reward ?? 0,
      };
      if (includeMetadata) {
        row.source = ex.source;
        row.scenario_id = ex.scenarioId;
      }
      return JSON.stringify(row);
    })
    .join("\n");
}
