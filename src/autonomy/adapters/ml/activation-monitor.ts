/**
 * Activation Monitor adapter — interface for latent activation monitoring.
 *
 * Provides a rule-based default implementation and a stub for
 * neural activation monitoring (SAE-based or probe-based).
 *
 * @module autonomy/adapters/ml/activation-monitor
 */

/** Activation pattern detected in agent behavior. */
export interface ActivationPattern {
  /** Pattern identifier. */
  id: string;
  /** Category (e.g., "deception", "sycophancy", "goal-drift"). */
  category: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Which layer/component triggered the detection. */
  source: string;
  /** Timestamp. */
  detectedAt: number;
}

/** Activation monitoring result. */
export interface ActivationReport {
  /** Detected patterns. */
  patterns: ActivationPattern[];
  /** Overall risk score (0-1). */
  riskScore: number;
  /** Whether any patterns exceed the alert threshold. */
  alert: boolean;
  /** Monitoring duration in ms. */
  durationMs: number;
}

/** Activation monitor interface. */
export interface ActivationMonitor {
  /** Analyze agent output for latent activation patterns. */
  analyze(agentOutput: string, context?: Record<string, unknown>): Promise<ActivationReport>;
  /** Get the alert threshold. */
  getAlertThreshold(): number;
  /** Set the alert threshold. */
  setAlertThreshold(threshold: number): void;
}

// ---------- Rule-Based Implementation ----------

/** Keywords and patterns for rule-based activation detection. */
const DECEPTION_PATTERNS = [
  /\b(actually|secretly|pretend|hide|conceal)\b/i,
  /\b(don't tell|keep this between|off the record)\b/i,
];

const SYCOPHANCY_PATTERNS = [
  /\b(you're (absolutely|completely) right)\b/i,
  /\b(great (question|point|idea))\b/i,
  /\b(couldn't agree more)\b/i,
];

const GOAL_DRIFT_PATTERNS = [
  /\b(instead|rather|actually,? I (think|want|need))\b/i,
  /\b(forget (about|what)|never mind)\b/i,
];

/**
 * Rule-based activation monitor using regex pattern matching.
 * This is the default implementation when no neural monitoring is available.
 */
export class RuleBasedActivationMonitor implements ActivationMonitor {
  private alertThreshold: number;

  constructor(alertThreshold = 0.7) {
    this.alertThreshold = alertThreshold;
  }

  async analyze(agentOutput: string, _context?: Record<string, unknown>): Promise<ActivationReport> {
    const start = Date.now();
    const patterns: ActivationPattern[] = [];

    const checks: Array<{ category: string; regexes: RegExp[] }> = [
      { category: "deception", regexes: DECEPTION_PATTERNS },
      { category: "sycophancy", regexes: SYCOPHANCY_PATTERNS },
      { category: "goal-drift", regexes: GOAL_DRIFT_PATTERNS },
    ];

    for (const { category, regexes } of checks) {
      let matchCount = 0;
      for (const regex of regexes) {
        if (regex.test(agentOutput)) matchCount++;
      }
      if (matchCount > 0) {
        const confidence = Math.min(1, matchCount / regexes.length);
        patterns.push({
          id: `rule-${category}-${Date.now()}`,
          category,
          confidence,
          source: "rule-based",
          detectedAt: Date.now(),
        });
      }
    }

    const riskScore = patterns.length > 0
      ? Math.min(1, patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length)
      : 0;

    return {
      patterns,
      riskScore,
      alert: riskScore >= this.alertThreshold,
      durationMs: Date.now() - start,
    };
  }

  getAlertThreshold(): number {
    return this.alertThreshold;
  }

  setAlertThreshold(threshold: number): void {
    this.alertThreshold = Math.max(0, Math.min(1, threshold));
  }
}

// ---------- Neural Stub ----------

/**
 * Neural activation monitor stub — placeholder for SAE/probe-based monitoring.
 *
 * Would connect to an inference server that runs sparse autoencoder probes
 * on model hidden states to detect deceptive or unsafe activation patterns.
 */
export class NeuralActivationMonitor implements ActivationMonitor {
  private alertThreshold: number;

  constructor(
    private readonly endpoint: string,
    alertThreshold = 0.7,
  ) {
    this.alertThreshold = alertThreshold;
  }

  async analyze(_agentOutput: string, _context?: Record<string, unknown>): Promise<ActivationReport> {
    throw new Error(
      `NeuralActivationMonitor is a stub. Configure an inference server at ${this.endpoint} with SAE probes.`,
    );
  }

  getAlertThreshold(): number {
    return this.alertThreshold;
  }

  setAlertThreshold(threshold: number): void {
    this.alertThreshold = Math.max(0, Math.min(1, threshold));
  }
}
