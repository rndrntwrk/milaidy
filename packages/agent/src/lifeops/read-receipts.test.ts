import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLifeOpsReminderAttempt,
  createLifeOpsReminderPlan,
  ensureLifeOpsTables,
  LifeOpsRepository,
} from "./repository.js";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

const AGENT_ID = "read-receipts-test-agent";

function createPgliteRuntime(dbRef: () => PGlite): IAgentRuntime {
  return {
    agentId: AGENT_ID,
    character: { name: AGENT_ID },
    getSetting: () => undefined,
    getService: () => null,
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          return dbRef().query(sql);
        },
      },
    },
  } as unknown as IAgentRuntime;
}

describe("read receipt tracking", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let repo: LifeOpsRepository;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(() => db);
    await ensureLifeOpsTables(runtime);
    repo = new LifeOpsRepository(runtime);
  });

  afterEach(async () => {
    await db.close();
  });

  /** Helper: create a reminder plan so the foreign key is satisfied. */
  async function seedPlan(): Promise<string> {
    const plan = createLifeOpsReminderPlan({
      agentId: AGENT_ID,
      ownerType: "definition",
      ownerId: "def-001",
      steps: [],
      mutePolicy: {},
      quietHours: {},
    });
    await repo.createReminderPlan(plan);
    return plan.id;
  }

  /** Helper: create a reminder attempt with a given outcome. */
  async function seedAttempt(
    planId: string,
    outcome: string,
    deliveryMetadata: Record<string, unknown> = {},
  ): Promise<string> {
    const attempt = createLifeOpsReminderAttempt({
      agentId: AGENT_ID,
      planId,
      ownerType: "definition",
      ownerId: "def-001",
      occurrenceId: null,
      channel: "in_app",
      stepIndex: 0,
      scheduledFor: new Date().toISOString(),
      attemptedAt: new Date().toISOString(),
      outcome,
      connectorRef: null,
      deliveryMetadata,
    });
    await repo.createReminderAttempt(attempt);
    return attempt.id;
  }

  it("updates a delivered attempt to delivered_read", async () => {
    const planId = await seedPlan();
    const attemptId = await seedAttempt(planId, "delivered");

    await repo.updateReminderAttemptOutcome(attemptId, "delivered_read", {
      readDetectedAt: new Date().toISOString(),
    });

    const attempts = await repo.listReminderAttempts(AGENT_ID, {
      planId,
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("delivered_read");
  });

  it("merges metadata when updating outcome", async () => {
    const planId = await seedPlan();
    const attemptId = await seedAttempt(planId, "delivered");

    const readTime = new Date().toISOString();
    await repo.updateReminderAttemptOutcome(attemptId, "delivered_read", {
      readDetectedAt: readTime,
      readSource: "poll",
    });

    const attempts = await repo.listReminderAttempts(AGENT_ID, { planId });
    const meta = attempts[0]?.deliveryMetadata;
    expect(meta).toBeDefined();
    expect(meta?.readDetectedAt).toBe(readTime);
    expect(meta?.readSource).toBe("poll");
  });

  it("preserves original delivery metadata when updating outcome", async () => {
    const planId = await seedPlan();
    const attemptId = await seedAttempt(planId, "delivered", {
      sentVia: "push",
      messageId: "msg-abc",
    });

    await repo.updateReminderAttemptOutcome(attemptId, "delivered_read", {
      readDetectedAt: new Date().toISOString(),
    });

    const attempts = await repo.listReminderAttempts(AGENT_ID, { planId });
    const meta = attempts[0]?.deliveryMetadata;
    expect(meta?.sentVia).toBe("push");
    expect(meta?.messageId).toBe("msg-abc");
    expect(meta?.readDetectedAt).toBeDefined();
  });

  it("updates outcome without metadata when none provided", async () => {
    const planId = await seedPlan();
    const attemptId = await seedAttempt(planId, "delivered", {
      sentVia: "push",
    });

    await repo.updateReminderAttemptOutcome(attemptId, "delivered_unread");

    const attempts = await repo.listReminderAttempts(AGENT_ID, { planId });
    expect(attempts[0]?.outcome).toBe("delivered_unread");
    // Original metadata is preserved since no merge happened
    expect(attempts[0]?.deliveryMetadata?.sentVia).toBe("push");
  });

  it("round-trips multiple attempts with different outcomes", async () => {
    const planId = await seedPlan();
    await seedAttempt(planId, "delivered");
    await seedAttempt(planId, "blocked_quiet_hours");
    await seedAttempt(planId, "delivered_read");

    const attempts = await repo.listReminderAttempts(AGENT_ID, { planId });
    expect(attempts).toHaveLength(3);

    const outcomes = attempts.map((a) => a.outcome);
    expect(outcomes).toContain("delivered");
    expect(outcomes).toContain("blocked_quiet_hours");
    expect(outcomes).toContain("delivered_read");
  });
});
