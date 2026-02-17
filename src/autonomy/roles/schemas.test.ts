import { describe, expect, it } from "vitest";
import type { ToolActionHandler } from "../workflow/types.js";
import {
  parseAuditorAuditResponse,
  parseExecutorExecuteRequest,
  parseOrchestratedRequest,
} from "./schemas.js";

const mockActionHandler: ToolActionHandler = async () => ({
  result: { ok: true },
  durationMs: 1,
});

describe("role boundary schemas", () => {
  it("accepts a valid orchestrated request", () => {
    const parsed = parseOrchestratedRequest({
      description: "run a task",
      source: "user",
      sourceTrust: 0.9,
      agentId: "agent-1",
      actionHandler: mockActionHandler,
      identityConfig: {
        coreValues: ["helpfulness"],
        communicationStyle: {
          tone: "casual",
          verbosity: "balanced",
          personaVoice: "default",
        },
        hardBoundaries: [],
        softPreferences: {},
        identityVersion: 1,
      },
      recentOutputs: ["ok"],
    });

    expect(parsed.source).toBe("user");
    expect(parsed.sourceTrust).toBe(0.9);
  });

  it("rejects malformed orchestrator requests", () => {
    expect(() =>
      parseOrchestratedRequest({
        description: "run a task",
        source: "user",
        sourceTrust: 2,
        agentId: "agent-1",
        actionHandler: mockActionHandler,
        identityConfig: {
          coreValues: ["helpfulness"],
          communicationStyle: {
            tone: "casual",
            verbosity: "balanced",
            personaVoice: "default",
          },
          hardBoundaries: [],
          softPreferences: {},
          identityVersion: 1,
        },
      }),
    ).toThrow("Role boundary validation failed for RoleOrchestrator.execute request");
  });

  it("rejects malformed executor requests", () => {
    expect(() =>
      parseExecutorExecuteRequest({
        tool: "",
        params: {},
        source: "llm",
        requestId: "req-1",
      }),
    ).toThrow("Role boundary validation failed for ExecutorRole.execute request");
  });

  it("rejects malformed auditor responses", () => {
    expect(() =>
      parseAuditorAuditResponse({
        eventCount: 0,
        anomalies: [],
        recommendations: [],
        auditedAt: Date.now(),
      }),
    ).toThrow("Role boundary validation failed for AuditorRole.audit response");
  });
});
