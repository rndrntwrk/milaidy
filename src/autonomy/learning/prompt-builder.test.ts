import { describe, expect, it } from "vitest";
import type { AutonomyIdentityConfig } from "../identity/schema.js";
import { SystemPromptBuilder } from "./prompt-builder.js";

function makeIdentity(
  overrides?: Partial<AutonomyIdentityConfig>,
): AutonomyIdentityConfig {
  return {
    coreValues: ["honesty", "helpfulness", "safety"],
    communicationStyle: {
      tone: "friendly",
      verbosity: "concise",
      personaVoice: "professional assistant",
    },
    hardBoundaries: ["share private data", "execute harmful code"],
    ...overrides,
  };
}

describe("SystemPromptBuilder", () => {
  const builder = new SystemPromptBuilder();

  describe("build()", () => {
    it("includes core values from identity", () => {
      const prompt = builder.build(makeIdentity());
      expect(prompt).toContain("Core Values");
      expect(prompt).toContain("- honesty");
      expect(prompt).toContain("- helpfulness");
      expect(prompt).toContain("- safety");
    });

    it("includes communication style", () => {
      const prompt = builder.build(makeIdentity());
      expect(prompt).toContain("Communication Style");
      expect(prompt).toContain("Tone: friendly");
      expect(prompt).toContain("Verbosity: concise");
      expect(prompt).toContain("Voice: professional assistant");
    });

    it("includes hard boundaries", () => {
      const prompt = builder.build(makeIdentity());
      expect(prompt).toContain("Hard Boundaries");
      expect(prompt).toContain("NEVER");
      expect(prompt).toContain("- share private data");
      expect(prompt).toContain("- execute harmful code");
    });

    it("adds CoT instructions when cotEnabled", () => {
      const prompt = builder.build(makeIdentity(), { cotEnabled: true });
      expect(prompt).toContain("Reasoning Instructions");
      expect(prompt).toContain("Think step-by-step");
    });

    it("omits CoT instructions when cotEnabled is false", () => {
      const prompt = builder.build(makeIdentity(), { cotEnabled: false });
      expect(prompt).not.toContain("Reasoning Instructions");
      expect(prompt).not.toContain("Think step-by-step");
    });

    it("adds truthfulness reminder by default", () => {
      const prompt = builder.build(makeIdentity());
      expect(prompt).toContain("Truthfulness");
      expect(prompt).toContain("truthful and accurate");
      expect(prompt).toContain("Do not agree with incorrect statements");
    });

    it("omits truthfulness reminder when disabled", () => {
      const prompt = builder.build(makeIdentity(), {
        truthfulnessReminder: false,
      });
      expect(prompt).not.toContain("Truthfulness");
    });

    it("respects maxLength truncation", () => {
      const prompt = builder.build(makeIdentity(), { maxLength: 100 });
      expect(prompt.length).toBeLessThanOrEqual(100);
      expect(prompt).toMatch(/\.\.\.$/);
    });

    it("includes tool instructions by default", () => {
      const prompt = builder.build(makeIdentity());
      expect(prompt).toContain("Tool Usage");
      expect(prompt).toContain("Validate inputs");
    });

    it("omits tool instructions when disabled", () => {
      const prompt = builder.build(makeIdentity(), {
        includeToolInstructions: false,
      });
      expect(prompt).not.toContain("Tool Usage");
    });
  });

  describe("buildWithContext()", () => {
    it("adds current goals", () => {
      const prompt = builder.buildWithContext(makeIdentity(), {
        currentGoals: ["Summarize document", "Send email"],
      });
      expect(prompt).toContain("Current Goals");
      expect(prompt).toContain("- Summarize document");
      expect(prompt).toContain("- Send email");
    });

    it("adds drift warning when present", () => {
      const prompt = builder.buildWithContext(makeIdentity(), {
        driftWarning: "Style consistency has dropped below threshold",
      });
      expect(prompt).toContain("Drift Warning");
      expect(prompt).toContain("Style consistency has dropped below threshold");
    });

    it("adds safe mode notice", () => {
      const prompt = builder.buildWithContext(makeIdentity(), {
        safeMode: true,
      });
      expect(prompt).toContain("SAFE MODE ACTIVE");
      expect(prompt).toContain("read-only operations");
    });

    it("adds recent tool results", () => {
      const prompt = builder.buildWithContext(makeIdentity(), {
        recentToolResults: [
          { tool: "search", success: true },
          { tool: "write_file", success: false },
        ],
      });
      expect(prompt).toContain("Recent Tool Results");
      expect(prompt).toContain("search: succeeded");
      expect(prompt).toContain("write_file: failed");
    });

    it("returns base prompt when context is empty", () => {
      const base = builder.build(makeIdentity());
      const withContext = builder.buildWithContext(makeIdentity(), {});
      expect(withContext).toBe(base);
    });
  });

  describe("buildRoleTemplate()", () => {
    it("builds planner template with role-specific context and variables", () => {
      const template = builder.buildRoleTemplate("planner", makeIdentity());
      expect(template.id).toBe("planner-baseline");
      expect(template.systemPrompt).toContain("Planner Context");
      expect(template.systemPrompt).toContain("ordered plan steps");
      expect(template.userTemplate).toContain("{{objective}}");
      expect(template.variables).toEqual(["objective", "constraints", "context"]);
    });

    it("builds executor and verifier templates with different user templates", () => {
      const templates = builder.buildRoleTemplates(makeIdentity());
      expect(templates.executor.systemPrompt).toContain("Executor Context");
      expect(templates.verifier.systemPrompt).toContain("Verifier Context");
      expect(templates.executor.userTemplate).toContain("{{tool_request}}");
      expect(templates.verifier.userTemplate).toContain("{{execution_result}}");
    });

    it("adds stronger anti-sycophancy constraints in truth-first variant", () => {
      const template = builder.buildRoleTemplate("planner", makeIdentity(), {
        variant: "truth-first",
      });
      expect(template.id).toBe("planner-truth-first");
      expect(template.systemPrompt).toContain("uncertainty bounds");
      expect(template.systemPrompt).toContain("unsupported agreement");
    });

    it("adds stricter tool guardrails in tool-safety-first variant", () => {
      const template = builder.buildRoleTemplate("executor", makeIdentity(), {
        variant: "tool-safety-first",
      });
      expect(template.id).toBe("executor-tool-safety-first");
      expect(template.systemPrompt).toContain("approval tokens");
      expect(template.systemPrompt).toContain("ambiguous parameters");
    });
  });
});
