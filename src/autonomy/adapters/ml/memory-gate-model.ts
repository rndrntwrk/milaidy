/**
 * Memory Gate ML Model adapter — interface for ML-based memory gating decisions.
 *
 * Provides a rule-based default and a lightweight logistic regression baseline.
 *
 * @module autonomy/adapters/ml/memory-gate-model
 */

import { readFile } from "node:fs/promises";

/** Features extracted from a memory write for ML scoring. */
export interface MemoryFeatures {
  /** Trust score of the source. */
  trustScore: number;
  /** Content length in characters. */
  contentLength: number;
  /** Whether the source is verified. */
  sourceVerified: boolean;
  /** Age of the source relationship in days. */
  sourceAgeDays: number;
  /** Number of prior interactions with this source. */
  priorInteractions: number;
  /** Semantic similarity to existing memories (0-1). */
  semanticSimilarity?: number;
  /** Whether content contains external links. */
  hasExternalLinks: boolean;
  /** Whether content modifies core identity values. */
  touchesCoreValues: boolean;
}

/** Memory gate model prediction. */
export interface GatePrediction {
  /** Probability of acceptance (0-1). */
  acceptProbability: number;
  /** Recommended action. */
  action: "allow" | "quarantine" | "reject";
  /** Model confidence (0-1). */
  confidence: number;
  /** Feature importances for explainability. */
  featureImportances?: Record<string, number>;
}

/** Memory gate model interface. */
export interface MemoryGateModel {
  /** Predict gate decision from features. */
  predict(features: MemoryFeatures): Promise<GatePrediction>;
  /** Update model with labeled training example. */
  update?(features: MemoryFeatures, label: "allow" | "reject"): Promise<void>;
}

// ---------- Rule-Based Implementation ----------

/**
 * Rule-based memory gate model using weighted feature scoring.
 * This is the default implementation.
 */
export class RuleBasedGateModel implements MemoryGateModel {
  private readonly quarantineThreshold: number;
  private readonly rejectThreshold: number;

  constructor(quarantineThreshold = 0.4, rejectThreshold = 0.2) {
    this.quarantineThreshold = quarantineThreshold;
    this.rejectThreshold = rejectThreshold;
  }

  async predict(features: MemoryFeatures): Promise<GatePrediction> {
    // Weighted scoring
    let score = 0;
    score += features.trustScore * 0.35;
    score += (features.sourceVerified ? 1 : 0) * 0.15;
    score += Math.min(1, features.sourceAgeDays / 365) * 0.10;
    score += Math.min(1, features.priorInteractions / 100) * 0.10;
    score += (features.semanticSimilarity ?? 0.5) * 0.10;
    score += (features.hasExternalLinks ? 0 : 1) * 0.10;
    score += (features.touchesCoreValues ? 0 : 1) * 0.10;

    const action: "allow" | "quarantine" | "reject" =
      score >= this.quarantineThreshold ? "allow" :
      score >= this.rejectThreshold ? "quarantine" :
      "reject";

    return {
      acceptProbability: score,
      action,
      confidence: Math.abs(score - this.quarantineThreshold) + 0.5,
      featureImportances: {
        trustScore: 0.35,
        sourceVerified: 0.15,
        sourceAgeDays: 0.10,
        priorInteractions: 0.10,
        semanticSimilarity: 0.10,
        hasExternalLinks: 0.10,
        touchesCoreValues: 0.10,
      },
    };
  }
}

// ---------- Logistic Regression Baseline ----------

const LOGISTIC_FEATURE_KEYS = [
  "trustScore",
  "contentLengthNorm",
  "sourceVerified",
  "sourceAgeNorm",
  "priorInteractionsNorm",
  "semanticSimilarity",
  "hasExternalLinks",
  "touchesCoreValues",
] as const;

type LogisticFeatureKey = (typeof LOGISTIC_FEATURE_KEYS)[number];

interface LogisticModelState {
  bias: number;
  learningRate: number;
  weights: Record<LogisticFeatureKey, number>;
}

const DEFAULT_LOGISTIC_MODEL: LogisticModelState = {
  bias: -1.4,
  learningRate: 0.05,
  weights: {
    trustScore: 2.2,
    contentLengthNorm: -0.4,
    sourceVerified: 1.1,
    sourceAgeNorm: 0.7,
    priorInteractionsNorm: 0.6,
    semanticSimilarity: 0.9,
    hasExternalLinks: -0.8,
    touchesCoreValues: -1.4,
  },
};

function cloneDefaultModelState(): LogisticModelState {
  return {
    bias: DEFAULT_LOGISTIC_MODEL.bias,
    learningRate: DEFAULT_LOGISTIC_MODEL.learningRate,
    weights: { ...DEFAULT_LOGISTIC_MODEL.weights },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number): number {
  const bounded = clamp(value, -20, 20);
  return 1 / (1 + Math.exp(-bounded));
}

function normalizeContentLength(contentLength: number): number {
  const safe = Number.isFinite(contentLength) ? Math.max(0, contentLength) : 0;
  return clamp01(Math.log1p(safe) / Math.log1p(5000));
}

function normalizeDayWindow(days: number, maxDays: number): number {
  const safe = Number.isFinite(days) ? Math.max(0, days) : 0;
  return clamp01(safe / maxDays);
}

function parseModelFile(raw: string): LogisticModelState | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next = cloneDefaultModelState();

    if (typeof parsed.bias === "number" && Number.isFinite(parsed.bias)) {
      next.bias = parsed.bias;
    }

    if (
      typeof parsed.learningRate === "number" &&
      Number.isFinite(parsed.learningRate) &&
      parsed.learningRate > 0
    ) {
      next.learningRate = parsed.learningRate;
    }

    const weights = parsed.weights as Record<string, unknown> | undefined;
    if (weights && typeof weights === "object") {
      for (const key of LOGISTIC_FEATURE_KEYS) {
        const value = weights[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          next.weights[key] = value;
        }
      }
    }

    return next;
  } catch {
    return null;
  }
}

/**
 * Logistic regression memory gate model baseline.
 *
 * Uses a compact, local logistic model with:
 * - deterministic feature normalization
 * - optional model coefficient loading from JSON
 * - online coefficient updates for baseline adaptation
 */
export class LogisticRegressionGateModel implements MemoryGateModel {
  private readonly modelState: LogisticModelState;
  private loadedFromPath = false;

  constructor(
    private readonly modelPath: string,
    private readonly quarantineThreshold = 0.4,
    private readonly rejectThreshold = 0.2,
  ) {
    this.modelState = cloneDefaultModelState();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadedFromPath) return;
    this.loadedFromPath = true;
    if (!this.modelPath || this.modelPath.trim().length === 0) return;

    try {
      const raw = await readFile(this.modelPath, "utf8");
      const loaded = parseModelFile(raw);
      if (loaded) {
        this.modelState.bias = loaded.bias;
        this.modelState.learningRate = loaded.learningRate;
        for (const key of LOGISTIC_FEATURE_KEYS) {
          this.modelState.weights[key] = loaded.weights[key];
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        // Ignore malformed/unavailable model files and continue on defaults.
      }
    }
  }

  private featureVector(features: MemoryFeatures): Record<LogisticFeatureKey, number> {
    return {
      trustScore: clamp01(features.trustScore),
      contentLengthNorm: normalizeContentLength(features.contentLength),
      sourceVerified: features.sourceVerified ? 1 : 0,
      sourceAgeNorm: normalizeDayWindow(features.sourceAgeDays, 365),
      priorInteractionsNorm: normalizeDayWindow(features.priorInteractions, 100),
      semanticSimilarity: clamp01(features.semanticSimilarity ?? 0.5),
      hasExternalLinks: features.hasExternalLinks ? 1 : 0,
      touchesCoreValues: features.touchesCoreValues ? 1 : 0,
    };
  }

  private predictProbability(vector: Record<LogisticFeatureKey, number>): number {
    let linear = this.modelState.bias;
    for (const key of LOGISTIC_FEATURE_KEYS) {
      linear += this.modelState.weights[key] * vector[key];
    }
    return sigmoid(linear);
  }

  private featureImportances(
    vector: Record<LogisticFeatureKey, number>,
  ): Record<string, number> {
    const contributions = LOGISTIC_FEATURE_KEYS.map((key) => {
      const value = Math.abs(this.modelState.weights[key] * vector[key]);
      return [key, value] as const;
    });
    const total = contributions.reduce((sum, [, value]) => sum + value, 0);
    if (total <= 0) {
      return Object.fromEntries(
        LOGISTIC_FEATURE_KEYS.map((key) => [key, 0]),
      ) as Record<string, number>;
    }
    return Object.fromEntries(
      contributions.map(([key, value]) => [key, value / total]),
    );
  }

  private actionFromProbability(probability: number): "allow" | "quarantine" | "reject" {
    if (probability >= this.quarantineThreshold) return "allow";
    if (probability >= this.rejectThreshold) return "quarantine";
    return "reject";
  }

  async predict(features: MemoryFeatures): Promise<GatePrediction> {
    await this.ensureLoaded();
    const vector = this.featureVector(features);
    const probability = this.predictProbability(vector);
    const confidence = clamp01(
      0.5 +
        Math.max(
          Math.abs(probability - this.quarantineThreshold),
          Math.abs(probability - this.rejectThreshold),
        ),
    );

    return {
      acceptProbability: probability,
      action: this.actionFromProbability(probability),
      confidence,
      featureImportances: this.featureImportances(vector),
    };
  }

  async update(features: MemoryFeatures, label: "allow" | "reject"): Promise<void> {
    await this.ensureLoaded();
    const vector = this.featureVector(features);
    const target = label === "allow" ? 1 : 0;
    const prediction = this.predictProbability(vector);
    const error = target - prediction;
    const step = this.modelState.learningRate * error;

    this.modelState.bias = clamp(this.modelState.bias + step, -8, 8);
    for (const key of LOGISTIC_FEATURE_KEYS) {
      const delta = step * vector[key];
      this.modelState.weights[key] = clamp(
        this.modelState.weights[key] + delta,
        -8,
        8,
      );
    }
  }
}
