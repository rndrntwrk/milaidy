import {
  type IAgentRuntime,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  createGoalDataService,
} from "@elizaos/plugin-goals";
import {
  createTodoDataService,
} from "@elizaos/plugin-todo";
import type {
  LifeOpsGoalDefinition,
  LifeOpsOccurrence,
  LifeOpsTaskDefinition,
} from "@miladyai/shared/contracts/lifeops";

type MirrorMetadata = {
  externalId: string;
  hiddenFromWorkbench: boolean;
  syncedAt: string;
};

function isAgentScopedRecord(record: {
  domain: string;
  subjectType: string;
}): boolean {
  return record.domain === "agent_ops" || record.subjectType === "agent";
}

function readMirrorMetadata(
  metadata: Record<string, unknown>,
  key: "pluginTodoMirror" | "pluginGoalMirror",
): MirrorMetadata | null {
  const raw = metadata[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const externalId =
    typeof (raw as { externalId?: unknown }).externalId === "string"
      ? (raw as { externalId: string }).externalId.trim()
      : "";
  if (externalId.length === 0) {
    return null;
  }
  return {
    externalId,
    hiddenFromWorkbench:
      (raw as { hiddenFromWorkbench?: unknown }).hiddenFromWorkbench === true,
    syncedAt:
      typeof (raw as { syncedAt?: unknown }).syncedAt === "string"
        ? (raw as { syncedAt: string }).syncedAt
        : "",
  };
}

function writeMirrorMetadata(
  metadata: Record<string, unknown>,
  key: "pluginTodoMirror" | "pluginGoalMirror",
  externalId: string,
  syncedAt: string,
): Record<string, unknown> {
  return {
    ...metadata,
    [key]: {
      externalId,
      hiddenFromWorkbench: true,
      syncedAt,
    },
  };
}

function clearMirrorMetadata(
  metadata: Record<string, unknown>,
  key: "pluginTodoMirror" | "pluginGoalMirror",
): Record<string, unknown> {
  const next = { ...metadata };
  delete next[key];
  return next;
}

function nextOccurrenceDueDate(
  occurrences: LifeOpsOccurrence[],
): Date | undefined {
  const candidate = occurrences
    .filter((occurrence) =>
      occurrence.state === "pending" ||
      occurrence.state === "visible" ||
      occurrence.state === "snoozed",
    )
    .sort((left, right) => {
      const leftAt = Date.parse(
        left.dueAt ?? left.scheduledAt ?? left.relevanceStartAt,
      );
      const rightAt = Date.parse(
        right.dueAt ?? right.scheduledAt ?? right.relevanceStartAt,
      );
      return leftAt - rightAt;
    })[0];
  if (!candidate) {
    return undefined;
  }
  const timestamp = Date.parse(
    candidate.dueAt ?? candidate.scheduledAt ?? candidate.relevanceStartAt,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function mapDefinitionToTodoType(
  definition: LifeOpsTaskDefinition,
): "daily" | "one-off" | "aspirational" {
  if (definition.cadence.kind === "once") {
    return "one-off";
  }
  if (
    definition.cadence.kind === "daily" ||
    definition.cadence.kind === "times_per_day"
  ) {
    return "daily";
  }
  return "aspirational";
}

function buildDefinitionTodoTags(definition: LifeOpsTaskDefinition): string[] {
  return [
    "lifeops",
    "agent_ops",
    "mirror",
    `lifeops-kind:${definition.kind}`,
    `lifeops-cadence:${definition.cadence.kind}`,
  ];
}

function buildDefinitionTodoMetadata(
  definition: LifeOpsTaskDefinition,
): Record<string, unknown> {
  return {
    lifeopsMirror: {
      source: "lifeops",
      kind: "definition",
      definitionId: definition.id,
      domain: definition.domain,
      subjectType: definition.subjectType,
      hiddenFromWorkbench: true,
      status: definition.status,
      cadenceKind: definition.cadence.kind,
    },
  };
}

function buildGoalTags(goal: LifeOpsGoalDefinition): string[] {
  return [
    "lifeops",
    "agent_ops",
    "mirror",
    `goal-status:${goal.status}`,
    `goal-review:${goal.reviewState}`,
  ];
}

function buildGoalMetadata(
  goal: LifeOpsGoalDefinition,
): Record<string, unknown> {
  return {
    lifeopsMirror: {
      source: "lifeops",
      kind: "goal",
      goalId: goal.id,
      domain: goal.domain,
      subjectType: goal.subjectType,
      hiddenFromWorkbench: true,
      status: goal.status,
      reviewState: goal.reviewState,
    },
  };
}

function sameStringSet(left: string[] | undefined, right: string[]): boolean {
  const leftSet = new Set(left ?? []);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  for (const value of rightSet) {
    if (!leftSet.has(value)) {
      return false;
    }
  }
  return true;
}

async function syncTodoTags(
  todoData: ReturnType<typeof createTodoDataService>,
  todo: { id: UUID; tags?: string[] },
  desiredTags: string[],
): Promise<void> {
  const existing = new Set<string>(
    (todo.tags ?? []).filter((tag): tag is string => typeof tag === "string"),
  );
  const desired = new Set<string>(desiredTags);
  const toAdd = [...desired].filter((tag) => !existing.has(tag));
  const toRemove = [...existing].filter((tag) => !desired.has(tag));
  if (toAdd.length > 0) {
    await todoData.addTags(todo.id, toAdd);
  }
  if (toRemove.length > 0) {
    await todoData.removeTags(todo.id, toRemove);
  }
}

export async function syncAgentDefinitionTodoMirror(args: {
  runtime: IAgentRuntime;
  previous: LifeOpsTaskDefinition | null;
  definition: LifeOpsTaskDefinition;
  occurrences: LifeOpsOccurrence[];
}): Promise<LifeOpsTaskDefinition> {
  const { runtime, previous, definition, occurrences } = args;
  const previousMirror = readMirrorMetadata(
    previous?.metadata ?? definition.metadata,
    "pluginTodoMirror",
  );

  if (!isAgentScopedRecord(definition)) {
    if (previousMirror) {
      const todoData = createTodoDataService(runtime);
      await todoData.deleteTodo(previousMirror.externalId as UUID);
    }
    const metadata = clearMirrorMetadata(definition.metadata, "pluginTodoMirror");
    return metadata === definition.metadata ? definition : { ...definition, metadata };
  }

  const todoData = createTodoDataService(runtime);

  const desiredType = mapDefinitionToTodoType(definition);
  const desiredDueDate = nextOccurrenceDueDate(occurrences);
  const desiredCompleted = definition.status === "archived";
  const desiredMetadata = buildDefinitionTodoMetadata(definition);
  const desiredTags = buildDefinitionTodoTags(definition);
  const worldId = stringToUuid(`lifeops-agent-ops-world-${runtime.agentId}`) as UUID;
  const roomId = stringToUuid(`lifeops-agent-ops-room-${runtime.agentId}`) as UUID;
  const entityId = runtime.agentId as UUID;
  const nowIso = new Date().toISOString();

  let mirroredTodo = previousMirror
    ? await todoData.getTodo(previousMirror.externalId as UUID)
    : null;
  const requiresRecreate =
    !mirroredTodo ||
    mirroredTodo.type !== desiredType ||
    (mirroredTodo.isCompleted && !desiredCompleted) ||
    (mirroredTodo.dueDate && !desiredDueDate);

  if (requiresRecreate) {
    if (mirroredTodo) {
      await todoData.deleteTodo(mirroredTodo.id);
    }
    const todoId = await todoData.createTodo({
      agentId: runtime.agentId as UUID,
      worldId,
      roomId,
      entityId,
      name: definition.title,
      description: definition.description,
      type: desiredType,
      priority: definition.priority,
      isUrgent: definition.priority <= 2,
      dueDate: desiredDueDate,
      metadata: desiredMetadata,
      tags: desiredTags,
    });
    const metadata = writeMirrorMetadata(
      definition.metadata,
      "pluginTodoMirror",
      todoId,
      nowIso,
    );
    return { ...definition, metadata };
  }

  await todoData.updateTodo(mirroredTodo.id, {
    name: definition.title,
    description: definition.description,
    priority: definition.priority,
    isUrgent: definition.priority <= 2,
    isCompleted: desiredCompleted,
    completedAt: desiredCompleted ? new Date(definition.updatedAt) : undefined,
    dueDate: desiredDueDate,
    metadata: desiredMetadata,
  });
  if (!sameStringSet(mirroredTodo.tags, desiredTags)) {
    await syncTodoTags(todoData, mirroredTodo, desiredTags);
  }
  const metadata = writeMirrorMetadata(
    definition.metadata,
    "pluginTodoMirror",
    mirroredTodo.id,
    nowIso,
  );
  return { ...definition, metadata };
}

export async function syncAgentGoalMirror(args: {
  runtime: IAgentRuntime;
  previous: LifeOpsGoalDefinition | null;
  goal: LifeOpsGoalDefinition;
}): Promise<LifeOpsGoalDefinition> {
  const { runtime, previous, goal } = args;
  const previousMirror = readMirrorMetadata(
    previous?.metadata ?? goal.metadata,
    "pluginGoalMirror",
  );

  if (!isAgentScopedRecord(goal)) {
    if (previousMirror) {
      const goalData = createGoalDataService(runtime);
      await goalData.deleteGoal(previousMirror.externalId as UUID);
    }
    const metadata = clearMirrorMetadata(goal.metadata, "pluginGoalMirror");
    return metadata === goal.metadata ? goal : { ...goal, metadata };
  }

  const goalData = createGoalDataService(runtime);

  const desiredCompleted = goal.status === "satisfied";
  const desiredTags = buildGoalTags(goal);
  const desiredMetadata = buildGoalMetadata(goal);
  const nowIso = new Date().toISOString();
  let mirroredGoal = previousMirror
    ? await goalData.getGoal(previousMirror.externalId as UUID)
    : null;

  if (!mirroredGoal || (mirroredGoal.isCompleted && !desiredCompleted)) {
    if (mirroredGoal) {
      await goalData.deleteGoal(mirroredGoal.id);
    }
    const createdGoalId = await goalData.createGoal({
      agentId: runtime.agentId as UUID,
      ownerType: "agent",
      ownerId: runtime.agentId as UUID,
      name: goal.title,
      description: goal.description,
      metadata: desiredMetadata,
      tags: desiredTags,
    });
    if (!createdGoalId) {
      throw new Error(`Failed to create plugin-goals mirror for ${goal.id}`);
    }
    const metadata = writeMirrorMetadata(
      goal.metadata,
      "pluginGoalMirror",
      createdGoalId,
      nowIso,
    );
    return { ...goal, metadata };
  }

  await goalData.updateGoal(mirroredGoal.id, {
    name: goal.title,
    description: goal.description,
    isCompleted: desiredCompleted,
    completedAt: desiredCompleted ? new Date(goal.updatedAt) : undefined,
    metadata: desiredMetadata,
    tags: desiredTags,
  });
  const metadata = writeMirrorMetadata(
    goal.metadata,
    "pluginGoalMirror",
    mirroredGoal.id,
    nowIso,
  );
  return { ...goal, metadata };
}
