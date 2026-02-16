/**
 * Memory Gate ML Model adapter — interface for ML-based memory gating decisions.
 *
 * Provides a rule-based default and a stub for logistic regression model.
 *
 * @module autonomy/adapters/ml/memory-gate-model
 */

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

// ---------- Logistic Regression Stub ----------

/**
 * Logistic regression memory gate model stub.
 *
 * Would load a trained sklearn/ONNX model for binary classification
 * of memory writes as accept/reject.
 */
export class LogisticRegressionGateModel implements MemoryGateModel {
  constructor(
    private readonly modelPath: string,
    private readonly quarantineThreshold = 0.4,
    private readonly rejectThreshold = 0.2,
  ) {}

  async predict(_features: MemoryFeatures): Promise<GatePrediction> {
    throw new Error(
      `LogisticRegressionGateModel is a stub. Train and export a model to ${this.modelPath}.`,
    );
  }

  async update(_features: MemoryFeatures, _label: "allow" | "reject"): Promise<void> {
    throw new Error(
      `LogisticRegressionGateModel.update() is a stub. Implement online learning or batch retraining.`,
    );
  }
}
