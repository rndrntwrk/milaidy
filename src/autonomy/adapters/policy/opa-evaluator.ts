/**
 * OPA (Open Policy Agent) evaluator stub — optional external policy backend.
 *
 * Communicates with OPA's REST API to evaluate policies written in Rego.
 *
 * @module autonomy/adapters/policy/opa-evaluator
 */

import type { PolicyEvaluator, PolicyInput, PolicyDecision } from "./types.js";

/** Configuration for OPA evaluator. */
export interface OpaEvaluatorConfig {
  /** OPA server URL (e.g. http://localhost:8181). */
  url: string;
  /** Policy path in OPA (e.g. "v1/data/autonomy/allow"). */
  policyPath: string;
  /** Request timeout in milliseconds. Default: 5000. */
  timeoutMs?: number;
}

/**
 * OPA-backed policy evaluator stub.
 *
 * This is a structural stub — it defines the contract for integrating with
 * a running OPA server. Production usage requires a running OPA instance
 * with Rego policies loaded.
 */
export class OpaEvaluator implements PolicyEvaluator {
  private readonly config: Required<OpaEvaluatorConfig>;

  constructor(config: OpaEvaluatorConfig) {
    this.config = {
      url: config.url.replace(/\/$/, ""),
      policyPath: config.policyPath,
      timeoutMs: config.timeoutMs ?? 5000,
    };
  }

  async evaluate(input: PolicyInput): Promise<PolicyDecision> {
    const url = `${this.config.url}/${this.config.policyPath}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          allowed: false,
          reason: `OPA returned ${response.status}: ${response.statusText}`,
        };
      }

      const body = (await response.json()) as { result?: { allow?: boolean; reason?: string; requires_approval?: boolean } };
      const result = body.result;

      return {
        allowed: result?.allow ?? false,
        reason: result?.reason ?? "OPA decision",
        requiresApproval: result?.requires_approval,
      };
    } catch (err) {
      return {
        allowed: false,
        reason: `OPA evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async evaluateAll(input: PolicyInput): Promise<PolicyDecision[]> {
    // OPA evaluates all loaded policies in a single request
    const decision = await this.evaluate(input);
    return [decision];
  }

  async close(): Promise<void> {
    // HTTP client — no persistent connection to close
  }
}
