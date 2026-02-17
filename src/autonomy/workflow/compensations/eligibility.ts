/**
 * Compensation eligibility map for built-in tools.
 *
 * @module autonomy/workflow/compensations/eligibility
 */

export interface CompensationEligibility {
  toolName: string;
  strategy: "automated" | "manual";
  rationale: string;
}

export const BUILTIN_COMPENSATION_ELIGIBILITY: Record<
  string,
  CompensationEligibility
> = {
  CREATE_TASK: {
    toolName: "CREATE_TASK",
    strategy: "manual",
    rationale:
      "Task scheduler rollback API is not yet wired into the compensation context.",
  },
  GENERATE_AUDIO: {
    toolName: "GENERATE_AUDIO",
    strategy: "automated",
    rationale: "Generated media artifacts can be reversed via delete intent.",
  },
  GENERATE_IMAGE: {
    toolName: "GENERATE_IMAGE",
    strategy: "automated",
    rationale: "Generated media artifacts can be reversed via delete intent.",
  },
  GENERATE_VIDEO: {
    toolName: "GENERATE_VIDEO",
    strategy: "automated",
    rationale: "Generated media artifacts can be reversed via delete intent.",
  },
  PHETTA_NOTIFY: {
    toolName: "PHETTA_NOTIFY",
    strategy: "manual",
    rationale:
      "Notification delivery is externally observable and currently requires human remediation.",
  },
  PHETTA_SEND_EVENT: {
    toolName: "PHETTA_SEND_EVENT",
    strategy: "manual",
    rationale:
      "External event dispatch has no built-in retraction adapter in this phase.",
  },
};

export function listBuiltinCompensationEligibility(): CompensationEligibility[] {
  return Object.values(BUILTIN_COMPENSATION_ELIGIBILITY).sort((a, b) =>
    a.toolName.localeCompare(b.toolName),
  );
}
