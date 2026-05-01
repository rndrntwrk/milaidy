import type { ElizaConfig } from "../config/types.eliza.js";

export type AliceCodingAction =
  | "inspect_repo"
  | "run_tests"
  | "build"
  | "open_pr"
  | "deploy";

export type AliceDeployEnvironment = "staging" | "production";

export type AliceDeployRail = "webhook" | "local-shell" | "github-actions";

export interface AliceOperationalPolicy {
  allowedRepos: string[];
  stagingDeploys: "allow" | "approval";
  productionDeploys: "approval" | "deny";
  deployRail: "webhook";
}

export interface AliceCodingActionRequest {
  action: AliceCodingAction;
  repo?: string;
  environment?: AliceDeployEnvironment;
  deployRail?: AliceDeployRail;
  approval?: {
    approvedBy?: string;
    approvalId?: string;
  };
}

export interface AliceCodingActionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

const DEFAULT_ALLOWED_REPOS = [
  "rndrntwrk/milaidy",
  "Render-Network-OS/555-bot",
  "Render-Network-OS/stream",
];

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

export function resolveAliceOperationalDefaults(
  config: Pick<ElizaConfig, "alice">,
): AliceOperationalPolicy {
  const aliceConfig = config.alice;
  const coding =
    aliceConfig && typeof aliceConfig === "object" ? aliceConfig.coding : undefined;
  const allowedRepos = asStringArray(coding?.allowedRepos);
  return {
    allowedRepos:
      allowedRepos && allowedRepos.length > 0
        ? allowedRepos
        : DEFAULT_ALLOWED_REPOS,
    stagingDeploys:
      coding?.stagingDeploys === "approval" ? "approval" : "allow",
    productionDeploys:
      coding?.productionDeploys === "deny" ? "deny" : "approval",
    deployRail: "webhook",
  };
}

export function resolveAliceCodingActionDecision(
  policy: AliceOperationalPolicy,
  request: AliceCodingActionRequest,
): AliceCodingActionDecision {
  if (request.repo && !policy.allowedRepos.includes(request.repo)) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Repository is not in Alice's allowed repo list.",
    };
  }

  if (request.action !== "deploy") {
    return { allowed: true, requiresApproval: false };
  }

  if (request.environment !== "staging" && request.environment !== "production") {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Deploy environment must be staging or production.",
    };
  }

  if (request.deployRail !== policy.deployRail) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Deploys must use the webhook rail so they are visible in Ops.",
    };
  }

  if (request.environment === "production") {
    if (policy.productionDeploys === "deny") {
      return {
        allowed: false,
        requiresApproval: false,
        reason: "Production deploys are disabled for Alice.",
      };
    }
    if (!request.approval?.approvedBy || !request.approval.approvalId) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Production deploy requires explicit human approval.",
      };
    }
    return { allowed: true, requiresApproval: false };
  }

  if (request.environment === "staging" && policy.stagingDeploys === "approval") {
    if (!request.approval?.approvedBy || !request.approval.approvalId) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Staging deploy requires explicit human approval by policy.",
      };
    }
  }

  return { allowed: true, requiresApproval: false };
}
