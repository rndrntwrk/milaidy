/**
 * System Prompt Builder — serializes AutonomyIdentityConfig into structured prompts.
 *
 * Produces system prompts with core values, communication style, hard boundaries,
 * chain-of-thought instructions, and runtime context injection.
 *
 * @module autonomy/learning/prompt-builder
 */

import type { AutonomyIdentityConfig } from "../identity/schema.js";
import type { PromptOptions, TaskContext } from "./types.js";

// ---------- System Prompt Builder ----------

/**
 * Builds structured system prompts from identity config and runtime context.
 */
export class SystemPromptBuilder {
  /**
   * Build a system prompt from identity config.
   */
  build(
    identity: AutonomyIdentityConfig,
    options?: PromptOptions,
  ): string {
    const opts: Required<PromptOptions> = {
      cotEnabled: options?.cotEnabled ?? true,
      includeToolInstructions: options?.includeToolInstructions ?? true,
      truthfulnessReminder: options?.truthfulnessReminder ?? true,
      maxLength: options?.maxLength ?? 0,
    };

    const sections: string[] = [];

    // Core values
    if (identity.coreValues?.length) {
      sections.push(
        "## Core Values\n" +
          identity.coreValues.map((v) => `- ${v}`).join("\n"),
      );
    }

    // Communication style
    if (identity.communicationStyle) {
      const style = identity.communicationStyle;
      const parts: string[] = [];
      if (style.tone) parts.push(`Tone: ${style.tone}`);
      if (style.verbosity) parts.push(`Verbosity: ${style.verbosity}`);
      if (style.personaVoice) parts.push(`Voice: ${style.personaVoice}`);
      if (parts.length > 0) {
        sections.push("## Communication Style\n" + parts.join("\n"));
      }
    }

    // Hard boundaries
    if (identity.hardBoundaries?.length) {
      sections.push(
        "## Hard Boundaries\nYou must NEVER:\n" +
          identity.hardBoundaries.map((b) => `- ${b}`).join("\n"),
      );
    }

    // Chain-of-thought
    if (opts.cotEnabled) {
      sections.push(
        "## Reasoning Instructions\n" +
          "Think step-by-step before acting. For each tool call:\n" +
          "1. State what you are trying to achieve\n" +
          "2. Explain why this tool is appropriate\n" +
          "3. Verify the parameters are correct\n" +
          "4. Consider potential side effects",
      );
    }

    // Tool reasoning instructions
    if (opts.includeToolInstructions) {
      sections.push(
        "## Tool Usage\n" +
          "When using tools:\n" +
          "- Validate inputs before execution\n" +
          "- Check results after execution\n" +
          "- Report failures honestly\n" +
          "- Request approval for irreversible actions",
      );
    }

    // Truthfulness reminder (anti-sycophancy)
    if (opts.truthfulnessReminder) {
      sections.push(
        "## Truthfulness\n" +
          "Always be truthful and accurate. Do not agree with incorrect statements " +
          "to please the user. If you are uncertain, say so. If you disagree, " +
          "explain your reasoning respectfully.",
      );
    }

    let prompt = sections.join("\n\n");

    // Truncate if maxLength is set
    if (opts.maxLength > 0 && prompt.length > opts.maxLength) {
      prompt = prompt.slice(0, opts.maxLength - 3) + "...";
    }

    return prompt;
  }

  /**
   * Build a system prompt with runtime context appended.
   */
  buildWithContext(
    identity: AutonomyIdentityConfig,
    context: TaskContext,
    options?: PromptOptions,
  ): string {
    const base = this.build(identity, options);
    const contextSections: string[] = [];

    // Current goals
    if (context.currentGoals?.length) {
      contextSections.push(
        "## Current Goals\n" +
          context.currentGoals.map((g) => `- ${g}`).join("\n"),
      );
    }

    // Recent tool results
    if (context.recentToolResults?.length) {
      contextSections.push(
        "## Recent Tool Results\n" +
          context.recentToolResults
            .map((r) => `- ${r.tool}: ${r.success ? "succeeded" : "failed"}`)
            .join("\n"),
      );
    }

    // Drift warning
    if (context.driftWarning) {
      contextSections.push(
        `## Drift Warning\n${context.driftWarning}`,
      );
    }

    // Safe mode notice
    if (context.safeMode) {
      contextSections.push(
        "## SAFE MODE ACTIVE\n" +
          "The system is in safe mode due to errors. Only read-only operations are permitted. " +
          "All actions require explicit user approval.",
      );
    }

    if (contextSections.length === 0) return base;
    return base + "\n\n" + contextSections.join("\n\n");
  }
}
