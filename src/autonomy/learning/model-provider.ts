/**
 * Model Provider — abstraction for LLM completions and scoring.
 *
 * Provides a StubModelProvider for deterministic testing and an
 * HttpModelProvider for calling external LLM APIs.
 *
 * @module autonomy/learning/model-provider
 */

import type {
  CompletionRequest,
  CompletionResponse,
  ModelProvider,
  ModelProviderConfig,
  ScoringRequest,
  ScoringResponse,
} from "./types.js";

// ---------- Stub Model Provider ----------

/**
 * Deterministic model provider for testing.
 *
 * Returns canned responses or echoes the user prompt.
 * Scoring always returns 0.5 for all dimensions.
 */
export class StubModelProvider implements ModelProvider {
  private readonly responses: Map<string, string>;

  constructor(responses?: Map<string, string>) {
    this.responses = responses ?? new Map();
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const text =
      this.responses.get(request.userPrompt) ??
      `[stub response to: ${request.userPrompt}]`;

    return {
      text,
      tokenCount: text.split(/\s+/).length,
      durationMs: Date.now() - start,
      model: "stub",
    };
  }

  async score(request: ScoringRequest): Promise<ScoringResponse> {
    const dimensionScores: Record<string, number> = {};
    for (const dim of request.dimensions) {
      dimensionScores[dim] = 0.5;
    }

    return {
      overallScore: 0.5,
      dimensionScores,
      explanation: "Stub scorer returns 0.5 for all dimensions",
      model: "stub",
    };
  }
}

// ---------- HTTP Model Provider ----------

/**
 * Model provider that calls an external LLM API over HTTP.
 */
export class HttpModelProvider implements ModelProvider {
  private readonly config: Required<ModelProviderConfig>;

  constructor(config: ModelProviderConfig) {
    if (!config.baseUrl) {
      throw new Error("ModelProviderConfig.baseUrl is required");
    }
    if (!config.model) {
      throw new Error("ModelProviderConfig.model is required");
    }

    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey ?? "",
      model: config.model,
      defaultTemperature: config.defaultTemperature ?? 0.7,
      defaultMaxTokens: config.defaultMaxTokens ?? 1024,
      timeoutMs: config.timeoutMs ?? 30_000,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(
        `${this.config.baseUrl}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.config.apiKey
              ? { Authorization: `Bearer ${this.config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            temperature:
              request.temperature ?? this.config.defaultTemperature,
            max_tokens: request.maxTokens ?? this.config.defaultMaxTokens,
            stop: request.stopSequences,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Model API returned ${response.status}: ${await response.text()}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { completion_tokens: number };
      };

      const text = data.choices?.[0]?.message?.content ?? "";

      return {
        text,
        tokenCount: data.usage?.completion_tokens ?? text.split(/\s+/).length,
        durationMs: Date.now() - start,
        model: this.config.model,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Model API request timed out after ${this.config.timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async score(request: ScoringRequest): Promise<ScoringResponse> {
    const scoringPrompt = [
      "You are an evaluation judge. Score the following response against the rubric.",
      "",
      `## Rubric\n${request.rubric}`,
      "",
      `## Prompt\n${request.prompt}`,
      "",
      `## Response\n${request.response}`,
      "",
      `## Dimensions to score: ${request.dimensions.join(", ")}`,
      "",
      "Return a JSON object with:",
      '- "overallScore": number 0-1',
      '- "dimensionScores": { dimension: score } for each dimension',
      '- "explanation": string explaining your scoring',
    ].join("\n");

    const completion = await this.complete({
      systemPrompt: "You are a precise evaluation judge. Return only valid JSON.",
      userPrompt: scoringPrompt,
      temperature: 0.1,
      maxTokens: 512,
    });

    try {
      const parsed = JSON.parse(completion.text) as {
        overallScore: number;
        dimensionScores: Record<string, number>;
        explanation: string;
      };

      return {
        overallScore: Math.max(0, Math.min(1, parsed.overallScore ?? 0.5)),
        dimensionScores: parsed.dimensionScores ?? {},
        explanation: parsed.explanation ?? "",
        model: this.config.model,
      };
    } catch {
      // If the model doesn't return valid JSON, return a default score
      return {
        overallScore: 0.5,
        dimensionScores: Object.fromEntries(
          request.dimensions.map((d) => [d, 0.5]),
        ),
        explanation: "Failed to parse model scoring response",
        model: this.config.model,
      };
    }
  }
}
