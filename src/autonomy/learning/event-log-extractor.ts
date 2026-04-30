/**
 * Learning dataset extractor from execution event logs.
 *
 * @module autonomy/learning/event-log-extractor
 */

import { createHash } from "node:crypto";
import {
  parseLearningTraceDataset,
  type LearningTraceDataset,
  type LearningTraceExample,
  type TraceLabel,
} from "./dataset-schema.js";

export interface EventLogEntry {
  requestId: string;
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
  correlationId?: string;
}

export interface ExtractDatasetOptions {
  datasetId?: string;
  label: string;
  createdAt?: number;
  includeFailed?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function derivePolicyCompliance(
  decisionPayload: Record<string, unknown> | undefined,
): TraceLabel["policyCompliance"] {
  const validation = asRecord(decisionPayload?.validation);
  const approval = asRecord(decisionPayload?.approval);
  const validationOutcome = asString(validation?.outcome);
  const approvalRequired = approval?.required === true;
  const approvalOutcome = asString(approval?.outcome);

  if (validationOutcome === "failed") return "non_compliant";
  if (approvalRequired && approvalOutcome !== "approved") return "non_compliant";
  if (validationOutcome === "passed") return "compliant";
  return "uncertain";
}

function deriveVerificationPassed(
  verifiedPayload: Record<string, unknown> | undefined,
  decisionPayload: Record<string, unknown> | undefined,
): boolean {
  if (verifiedPayload) {
    return verifiedPayload.hasCriticalFailure !== true;
  }
  const verification = asRecord(decisionPayload?.verification);
  if (verification) {
    return verification.hasCriticalFailure !== true;
  }
  return true;
}

function deriveTaskOutcome(success: boolean, verificationPassed: boolean): TraceLabel["taskOutcome"] {
  if (!success) return "fail";
  return verificationPassed ? "success" : "partial";
}

function deriveVerificationAlignment(
  success: boolean,
  verificationPassed: boolean,
): TraceLabel["verificationAlignment"] {
  if (!success) return "unknown";
  if (success && verificationPassed) return "aligned";
  if (success && !verificationPassed) return "conflict";
  return "unknown";
}

function deriveSafetyRisk(
  decisionPayload: Record<string, unknown> | undefined,
  outcome: TraceLabel["taskOutcome"],
  policyCompliance: TraceLabel["policyCompliance"],
): TraceLabel["safetyRisk"] {
  const verification = asRecord(decisionPayload?.verification);
  const invariants = asRecord(decisionPayload?.invariants);
  if (
    verification?.hasCriticalFailure === true ||
    invariants?.hasCriticalViolation === true
  ) {
    return "high";
  }
  if (policyCompliance === "non_compliant") return "medium";
  if (outcome === "partial" || outcome === "fail") return "low";
  return "none";
}

function deriveRewardHackingSignal(
  decisionPayload: Record<string, unknown> | undefined,
  policyCompliance: TraceLabel["policyCompliance"],
): TraceLabel["rewardHackingSignal"] {
  const invariants = asRecord(decisionPayload?.invariants);
  if (invariants?.hasCriticalViolation === true) return "confirmed";
  if (policyCompliance === "non_compliant") return "suspected";
  return "none";
}

function computeReward(label: TraceLabel): number {
  let reward = 0.2;
  if (label.taskOutcome === "success") reward += 0.5;
  if (label.taskOutcome === "partial") reward += 0.25;
  if (label.verificationAlignment === "aligned") reward += 0.15;
  if (label.policyCompliance === "compliant") reward += 0.1;
  if (label.safetyRisk === "medium") reward -= 0.2;
  if (label.safetyRisk === "high") reward -= 0.4;
  return Math.max(0, Math.min(1, reward));
}

function stableExampleId(requestId: string): string {
  const digest = createHash("sha256")
    .update(requestId)
    .digest("hex")
    .slice(0, 12);
  return `trace-${digest}`;
}

function buildTraceExample(
  requestId: string,
  entries: EventLogEntry[],
): LearningTraceExample | null {
  const sorted = [...entries].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
  const proposed = sorted.find((entry) => entry.type === "tool:proposed");
  const executed = sorted.find((entry) => entry.type === "tool:executed");
  const failed = sorted.find((entry) => entry.type === "tool:failed");
  const verified = sorted.find((entry) => entry.type === "tool:verified");
  const decision = sorted.find((entry) => entry.type === "tool:decision:logged");

  const proposedPayload = asRecord(proposed?.payload);
  const executedPayload = asRecord(executed?.payload);
  const failedPayload = asRecord(failed?.payload);
  const verifiedPayload = asRecord(verified?.payload);
  const decisionPayload = asRecord(decision?.payload);

  const toolName =
    asString(decisionPayload?.toolName) ??
    asString(proposedPayload?.tool) ??
    asString(proposedPayload?.toolName);
  if (!toolName) return null;

  const source = asString(proposedPayload?.source) ?? "unknown";
  const toolInput =
    asRecord(proposedPayload?.params) ?? asRecord(decisionPayload?.params) ?? {};
  const startTimestamp = asNumber(proposed?.timestamp);
  const endTimestamp =
    asNumber(executed?.timestamp) ??
    asNumber(failed?.timestamp) ??
    asNumber(decision?.timestamp);
  const durationMs =
    asNumber(executedPayload?.durationMs) ??
    (startTimestamp !== undefined && endTimestamp !== undefined
      ? Math.max(0, endTimestamp - startTimestamp)
      : 0);
  const decisionSuccess = decisionPayload?.success;
  const success =
    typeof decisionSuccess === "boolean"
      ? decisionSuccess
      : failedPayload
        ? false
        : executedPayload !== undefined;
  const verificationPassed = deriveVerificationPassed(
    verifiedPayload,
    decisionPayload,
  );
  const policyCompliance = derivePolicyCompliance(decisionPayload);
  const taskOutcome = deriveTaskOutcome(success, verificationPassed);
  const labels: TraceLabel = {
    taskOutcome,
    verificationAlignment: deriveVerificationAlignment(success, verificationPassed),
    policyCompliance,
    safetyRisk: deriveSafetyRisk(decisionPayload, taskOutcome, policyCompliance),
    rewardHackingSignal: deriveRewardHackingSignal(
      decisionPayload,
      policyCompliance,
    ),
    ...(asString(decisionPayload?.error) ? { notes: asString(decisionPayload?.error) } : {}),
  };

  return {
    id: stableExampleId(requestId),
    requestId,
    correlationId:
      asString(decision?.correlationId) ??
      asString(proposed?.correlationId) ??
      asString(executed?.correlationId),
    toolName,
    source,
    toolInput,
    toolOutput:
      executedPayload?.result ??
      failedPayload?.reason ??
      failedPayload?.error,
    durationMs,
    reward: computeReward(labels),
    verificationPassed,
    labels,
    metadata: {
      eventCount: sorted.length,
      firstTimestamp: sorted[0]?.timestamp ?? 0,
      lastTimestamp: sorted[sorted.length - 1]?.timestamp ?? 0,
    },
  };
}

export function extractLearningTraceDatasetFromEvents(
  events: EventLogEntry[],
  options: ExtractDatasetOptions,
): LearningTraceDataset {
  const grouped = new Map<string, EventLogEntry[]>();
  for (const event of events) {
    if (!event.requestId) continue;
    const list = grouped.get(event.requestId);
    if (list) list.push(event);
    else grouped.set(event.requestId, [event]);
  }

  const examples: LearningTraceExample[] = [];
  for (const [requestId, entries] of grouped) {
    const example = buildTraceExample(requestId, entries);
    if (!example) continue;
    if (options.includeFailed === false && example.labels.taskOutcome === "fail") {
      continue;
    }
    examples.push(example);
  }

  const dataset = {
    id: options.datasetId ?? `dataset-${Date.now()}`,
    label: options.label,
    createdAt: options.createdAt ?? Date.now(),
    examples,
  };
  return parseLearningTraceDataset(dataset);
}
