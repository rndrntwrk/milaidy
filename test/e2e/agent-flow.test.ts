/**
 * E2E tests for agent conversation flow.
 *
 * These tests require the project to be built first.
 * Run: npm run build && npm run test:e2e
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { startHarness, type TestHarness } from "./framework/harness.js";

describe("Agent Conversation Flow", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    // Skip if no API key available
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.log("Skipping E2E tests: No API key available");
      return;
    }

    harness = await startHarness({
      config: {
        plugins: {
          allow: ["@elizaos/plugin-sql"],
        },
      },
      timeout: 60000,
      verbose: process.env.VERBOSE === "true",
    });
  }, 120000);

  afterAll(async () => {
    if (harness) {
      await harness.stop();
    }
  });

  test("should return status", async () => {
    if (!harness) return;

    const status = await harness.client.getStatus();
    expect(status).toBeDefined();
    expect(status.state).toBeDefined();
  });

  test("should return health check", async () => {
    if (!harness) return;

    const health = await harness.client.getHealth();
    expect(health.status).toMatch(/healthy|degraded/);
    expect(health.version).toBeDefined();
    expect(Array.isArray(health.checks)).toBe(true);
  });

  test("should return detailed health check", async () => {
    if (!harness) return;

    const health = await harness.client.getHealth(true);
    expect(health.status).toBeDefined();
    // Detailed health should have system info - but this depends on implementation
  });

  test("should list plugins", async () => {
    if (!harness) return;

    const plugins = await harness.client.getPlugins();
    expect(plugins).toBeDefined();
    expect(Array.isArray(plugins.plugins)).toBe(true);
  });

  test("should create conversation", async () => {
    if (!harness) return;

    const conversation = await harness.client.createConversation();
    expect(conversation.id).toBeDefined();
    expect(conversation.createdAt).toBeDefined();
  });

  test("should list conversations", async () => {
    if (!harness) return;

    const conversations = await harness.client.getConversations();
    expect(Array.isArray(conversations.conversations)).toBe(true);
  });

  // Chat tests require an AI provider to be configured
  test.skipIf(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)(
    "should respond to chat message",
    async () => {
      if (!harness) return;

      const response = await harness.client.chat({
        text: "Hello! Please respond with just 'Hi there!'",
      });

      expect(response.text).toBeDefined();
      expect(response.text.length).toBeGreaterThan(0);
      expect(response.sessionId).toBeDefined();
    },
  );

  test.skipIf(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)(
    "should maintain conversation context",
    async () => {
      if (!harness) return;

      // First message
      const response1 = await harness.client.chat({
        text: "My favorite color is blue. Remember this.",
      });
      const sessionId = response1.sessionId;

      // Second message in same session
      const response2 = await harness.client.chat({
        text: "What is my favorite color?",
        sessionId,
      });

      expect(response2.text.toLowerCase()).toContain("blue");
    },
  );
});

describe("Health Endpoints", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await startHarness({
      config: {
        plugins: { allow: [] },
      },
      timeout: 30000,
    });
  }, 60000);

  afterAll(async () => {
    if (harness) {
      await harness.stop();
    }
  });

  test("liveness probe returns ok", async () => {
    if (!harness) return;

    const response = await fetch(`http://localhost:${harness.port}/health/live`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  test("readiness probe returns health status", async () => {
    if (!harness) return;

    const response = await fetch(`http://localhost:${harness.port}/health/ready`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toMatch(/healthy|degraded/);
  });
});
