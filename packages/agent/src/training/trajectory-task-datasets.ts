import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Trajectory,
  TrajectoryLlmCall,
} from "../types/trajectory.js";

export interface GeminiTuningExample {
  messages: Array<{
    role: "system" | "user" | "model";
    content: string;
  }>;
}

export type TrajectoryTrainingTask =
  | "should_respond"
  | "context_routing"
  | "action_planner"
  | "response"
  | "media_description";

export interface TrajectoryTaskDatasetPaths {
  shouldRespondPath: string;
  contextRoutingPath: string;
  actionPlannerPath: string;
  responsePath: string;
  mediaDescriptionPath: string;
  summaryPath: string;
}

export interface TrajectoryTaskDatasetExport {
  counts: Record<TrajectoryTrainingTask, number>;
  paths: TrajectoryTaskDatasetPaths;
  examples: Record<TrajectoryTrainingTask, GeminiTuningExample[]>;
}

type TrajectoryCallLike = TrajectoryLlmCall & {
  metadata?: Record<string, unknown>;
};

const TASK_FILE_NAMES: Record<TrajectoryTrainingTask, string> = {
  should_respond: "should_respond_trajectories.jsonl",
  context_routing: "context_routing_trajectories.jsonl",
  action_planner: "action_planner_trajectories.jsonl",
  response: "response_trajectories.jsonl",
  media_description: "media_description_trajectories.jsonl",
};

function normalizeToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function collectCallHints(call: TrajectoryCallLike): string[] {
  const metadata = call.metadata ?? {};
  const tags = Array.isArray(call.tags) ? call.tags : [];
  const values = [
    call.purpose,
    call.stepType,
    call.actionType,
    call.model,
    metadata.modelType,
    metadata.purpose,
    metadata.model_type,
    metadata.stepType,
    ...tags,
  ];

  return values
    .map(normalizeToken)
    .filter((value, index, items) => value.length > 0 && items.indexOf(value) === index);
}

function hasContextRoutingFields(text: string): boolean {
  return (
    /(^|\n)primaryContext:/m.test(text) ||
    /(^|\n)secondaryContexts:/m.test(text) ||
    /(^|\n)evidenceTurnIds:/m.test(text) ||
    /<primaryContext>/i.test(text) ||
    /<secondaryContexts>/i.test(text) ||
    /<evidenceTurnIds>/i.test(text)
  );
}

function looksLikePlannerCall(call: TrajectoryCallLike): boolean {
  const response = call.response ?? "";
  const prompt = `${call.systemPrompt ?? ""}\n${call.userPrompt ?? ""}`;

  return (
    /<actions>/i.test(response) ||
    /(^|\n)actions:/m.test(response) ||
    (/thought/i.test(response) && /text/i.test(response)) ||
    /available actions/i.test(prompt) ||
    /actionNames/i.test(prompt)
  );
}

function stripContextRoutingPrompt(prompt: string): string {
  return prompt
    .replace(/\ncontext_routing:[\s\S]*?\ndecision_note:/m, "\ndecision_note:")
    .replace(/\n- primaryContext:[^\n]*/g, "")
    .replace(/\n- secondaryContexts:[^\n]*/g, "")
    .replace(/\n- evidenceTurnIds:[^\n]*/g, "")
    .trim();
}

function stripContextRoutingResponse(response: string): string {
  return response
    .replace(/\nprimaryContext:[^\n]*/g, "")
    .replace(/\nsecondaryContexts:[^\n]*/g, "")
    .replace(/\nevidenceTurnIds:[^\n]*/g, "")
    .replace(/<primaryContext>[\s\S]*?<\/primaryContext>/gi, "")
    .replace(/<secondaryContexts>[\s\S]*?<\/secondaryContexts>/gi, "")
    .replace(/<evidenceTurnIds>[\s\S]*?<\/evidenceTurnIds>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferTasksForCall(call: TrajectoryCallLike): TrajectoryTrainingTask[] {
  const hints = collectCallHints(call);
  const response = call.response ?? "";
  const tasks = new Set<TrajectoryTrainingTask>();

  if (
    hints.includes("should_respond") ||
    hints.includes("response_handler") ||
    hints.includes("shouldrespond")
  ) {
    tasks.add("should_respond");
  }

  if (hasContextRoutingFields(response)) {
    tasks.add("context_routing");
    tasks.add("should_respond");
  }

  if (
    hints.includes("action_planner") ||
    hints.includes("planner") ||
    hints.includes("action") ||
    hints.includes("runtime_use_model") ||
    looksLikePlannerCall(call)
  ) {
    tasks.add("action_planner");
  }

  if (
    hints.includes("media_description") ||
    hints.includes("image_description") ||
    hints.includes("describe_image") ||
    hints.includes("describe_audio") ||
    hints.includes("describe_video")
  ) {
    tasks.add("media_description");
  }

  if (
    hints.includes("response") ||
    hints.includes("reply") ||
    hints.includes("message_response")
  ) {
    tasks.add("response");
  }

  if (tasks.size === 0 && typeof call.response === "string" && call.response.trim()) {
    tasks.add("response");
  }

  return [...tasks];
}

function buildExampleForTask(
  call: TrajectoryCallLike,
  task: TrajectoryTrainingTask,
): GeminiTuningExample | null {
  const systemPrompt = call.systemPrompt?.trim();
  const userPrompt = call.userPrompt?.trim();
  const response = call.response?.trim();

  if (!systemPrompt || !userPrompt || !response) {
    return null;
  }

  if (task === "should_respond") {
    return {
      messages: [
        { role: "system", content: stripContextRoutingPrompt(systemPrompt) },
        { role: "user", content: userPrompt },
        { role: "model", content: stripContextRoutingResponse(response) },
      ],
    };
  }

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
      { role: "model", content: response },
    ],
  };
}

export function extractTrajectoryExamplesByTask(
  trajectories: Trajectory[],
  tasks?: readonly TrajectoryTrainingTask[],
): Record<TrajectoryTrainingTask, GeminiTuningExample[]> {
  const requestedTasks = new Set<TrajectoryTrainingTask>(
    tasks ?? [
      "should_respond",
      "context_routing",
      "action_planner",
      "response",
      "media_description",
    ],
  );

  const examples: Record<TrajectoryTrainingTask, GeminiTuningExample[]> = {
    should_respond: [],
    context_routing: [],
    action_planner: [],
    response: [],
    media_description: [],
  };

  for (const trajectory of trajectories) {
    for (const step of trajectory.steps ?? []) {
      for (const llmCall of step.llmCalls ?? []) {
        const call = llmCall as TrajectoryCallLike;
        const inferredTasks = inferTasksForCall(call);
        for (const task of inferredTasks) {
          if (!requestedTasks.has(task)) {
            continue;
          }

          const example = buildExampleForTask(call, task);
          if (example) {
            examples[task].push(example);
          }
        }
      }
    }
  }

  return examples;
}

export async function exportTrajectoryTaskDatasets(
  trajectories: Trajectory[],
  outputDir: string,
  tasks?: readonly TrajectoryTrainingTask[],
): Promise<TrajectoryTaskDatasetExport> {
  await mkdir(outputDir, { recursive: true });

  const examples = extractTrajectoryExamplesByTask(trajectories, tasks);
  const counts: Record<TrajectoryTrainingTask, number> = {
    should_respond: examples.should_respond.length,
    context_routing: examples.context_routing.length,
    action_planner: examples.action_planner.length,
    response: examples.response.length,
    media_description: examples.media_description.length,
  };

  const paths: TrajectoryTaskDatasetPaths = {
    shouldRespondPath: join(outputDir, TASK_FILE_NAMES.should_respond),
    contextRoutingPath: join(outputDir, TASK_FILE_NAMES.context_routing),
    actionPlannerPath: join(outputDir, TASK_FILE_NAMES.action_planner),
    responsePath: join(outputDir, TASK_FILE_NAMES.response),
    mediaDescriptionPath: join(outputDir, TASK_FILE_NAMES.media_description),
    summaryPath: join(outputDir, "trajectory_dataset_summary.json"),
  };

  await writeFile(
    paths.shouldRespondPath,
    `${examples.should_respond.map((example) => JSON.stringify(example)).join("\n")}${examples.should_respond.length > 0 ? "\n" : ""}`,
  );
  await writeFile(
    paths.contextRoutingPath,
    `${examples.context_routing.map((example) => JSON.stringify(example)).join("\n")}${examples.context_routing.length > 0 ? "\n" : ""}`,
  );
  await writeFile(
    paths.actionPlannerPath,
    `${examples.action_planner.map((example) => JSON.stringify(example)).join("\n")}${examples.action_planner.length > 0 ? "\n" : ""}`,
  );
  await writeFile(
    paths.responsePath,
    `${examples.response.map((example) => JSON.stringify(example)).join("\n")}${examples.response.length > 0 ? "\n" : ""}`,
  );
  await writeFile(
    paths.mediaDescriptionPath,
    `${examples.media_description.map((example) => JSON.stringify(example)).join("\n")}${examples.media_description.length > 0 ? "\n" : ""}`,
  );

  await writeFile(
    paths.summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        trajectoryCount: trajectories.length,
        counts,
        tasks: tasks ?? Object.keys(counts),
      },
      null,
      2,
    ),
  );

  return {
    counts,
    paths,
    examples,
  };
}
