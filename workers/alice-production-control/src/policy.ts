export type ReleaseBinding = {
  programDigest: string;
  releaseDigest: string;
  policyHash: string;
};

export type ReleaseAdmission = {
  binding: ReleaseBinding;
  deploymentManifestSha256: string;
  admissionGeneration: number;
};

export type ActionIntent = ReleaseBinding & {
  intentId: string;
  action: string;
  target: string;
  argumentHash: string;
  nonce: string;
  expiresAt: number;
  capabilityId?: string;
};

export type CapabilityGrant = ReleaseBinding & {
  capabilityId: string;
  scope: string;
  target: string;
  argumentHash: string;
  nonce: string;
  expiresAt: number;
  rollbackBoundary: string;
  revokedAt: number | null;
  usedAt: number | null;
};

export type AuthorizationContext = {
  now: number;
  binding: ReleaseBinding;
  pausedScopes: string[];
  consumedNonces: string[];
  capability: CapabilityGrant | null;
};

export const ALICE_DISABLED_ACTIONS = Object.freeze([
  "social.post",
  "social.message",
  "production.deploy",
  "repository.merge",
  "trade.execute",
  "funds.withdraw",
  "funds.bridge",
  "economic.sign",
  "identity.admin",
  "issuer.admin",
  "stream.public",
  "risk.increase",
]);

const LOW_RISK_ACTIONS = new Set([
  "research.read",
  "research.retrieve",
  "memory.read",
  "draft.create",
  "runtime.health",
  "sandbox.execute",
  "coding.patch.sandbox",
  "model.inference",
]);

export const ALICE_AUTONOMOUS_ACTIONS = Object.freeze([
  "research.read",
  "research.retrieve",
  "memory.read",
  "draft.create",
  "runtime.health",
]);

export const ALICE_CAPABILITY_ACTIONS = Object.freeze([
  "sandbox.execute",
  "coding.patch.sandbox",
]);

const DISABLED_ACTIONS = new Set(ALICE_DISABLED_ACTIONS);
const AUTONOMOUS_ACTIONS = new Set(ALICE_AUTONOMOUS_ACTIONS);
const CAPABILITY_ACTIONS = new Set(ALICE_CAPABILITY_ACTIONS);

function bindingsMatch(actual: ReleaseBinding, expected: ReleaseBinding): boolean {
  return (
    actual.programDigest === expected.programDigest &&
    actual.releaseDigest === expected.releaseDigest &&
    actual.policyHash === expected.policyHash
  );
}

export function authorizeIntent(
  intent: ActionIntent,
  context: AuthorizationContext,
): { allowed: boolean; code: string; risk: "low" | "high" | "unknown" } {
  if (
    typeof intent.intentId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(intent.intentId) ||
    typeof intent.action !== "string" ||
    !/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(intent.action) ||
    typeof intent.target !== "string" ||
    intent.target.trim().length === 0 ||
    intent.target.length > 512 ||
    typeof intent.argumentHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(intent.argumentHash) ||
    typeof intent.nonce !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(intent.nonce)
  ) {
    return { allowed: false, code: "INTENT_INVALID", risk: "unknown" };
  }
  const risk = DISABLED_ACTIONS.has(intent.action)
    ? "high"
    : LOW_RISK_ACTIONS.has(intent.action)
      ? "low"
      : "unknown";
  if (!bindingsMatch(intent, context.binding)) {
    return { allowed: false, code: "RELEASE_BINDING_MISMATCH", risk };
  }
  if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= context.now) {
    return { allowed: false, code: "INTENT_EXPIRED", risk };
  }
  if (context.consumedNonces.includes(intent.nonce)) {
    return { allowed: false, code: "NONCE_REPLAY", risk };
  }
  if (context.pausedScopes.includes("all")) {
    return { allowed: false, code: "PAUSED_ALL", risk };
  }
  if (context.pausedScopes.includes("release")) {
    return { allowed: false, code: "PAUSED_RELEASE", risk };
  }
  if (
    (intent.action === "sandbox.execute" || intent.action === "coding.patch.sandbox") &&
    context.pausedScopes.includes("coding")
  ) {
    return { allowed: false, code: "PAUSED_CODING", risk };
  }
  if (DISABLED_ACTIONS.has(intent.action)) {
    return { allowed: false, code: "ACTION_DISABLED", risk: "high" };
  }
  if (AUTONOMOUS_ACTIONS.has(intent.action)) {
    return { allowed: true, code: "AUTONOMOUS_LOW_RISK", risk: "low" };
  }
  if (CAPABILITY_ACTIONS.has(intent.action) && !context.capability) {
    return { allowed: false, code: "CAPABILITY_REQUIRED", risk: "low" };
  }
  if (CAPABILITY_ACTIONS.has(intent.action) && context.capability) {
    const capability = context.capability;
    if (!Number.isFinite(capability.expiresAt) || capability.expiresAt <= context.now) {
      return { allowed: false, code: "CAPABILITY_EXPIRED", risk: "low" };
    }
    if (capability.revokedAt !== null) {
      return { allowed: false, code: "CAPABILITY_REVOKED", risk: "low" };
    }
    if (capability.usedAt !== null) {
      return { allowed: false, code: "CAPABILITY_CONSUMED", risk: "low" };
    }
    if (
      !bindingsMatch(capability, context.binding) ||
      capability.capabilityId !== intent.capabilityId ||
      capability.scope !== intent.action ||
      capability.target !== intent.target ||
      capability.argumentHash !== intent.argumentHash ||
      capability.expiresAt < intent.expiresAt ||
      capability.rollbackBoundary.trim().length === 0 ||
      capability.nonce.trim().length === 0
    ) {
      return { allowed: false, code: "CAPABILITY_MISMATCH", risk: "low" };
    }
    return { allowed: true, code: "CAPABILITY_AUTHORIZED", risk: "low" };
  }
  return { allowed: false, code: "ACTION_NOT_ADMITTED", risk };
}

export type ModelBudgetRequest = ReleaseBinding & {
  requestId: string;
  model: string;
  estimatedUnits: number;
};

export type ModelBudgetContext = {
  binding: ReleaseBinding;
  pausedScopes: string[];
  usedUnits: number;
  maxUnits: number;
  existingReservation: { requestId: string; model: string; estimatedUnits: number } | null;
};

export const ALICE_ALLOWED_MODELS = Object.freeze([
  "workers-ai/@cf/openai/gpt-oss-20b",
  "workers-ai/@cf/openai/gpt-oss-120b",
  "@cf/baai/bge-m3",
]);
const ALLOWED_MODELS = new Set(ALICE_ALLOWED_MODELS);

export function reserveModelBudget(
  request: ModelBudgetRequest,
  context: ModelBudgetContext,
): {
  allowed: boolean;
  code: string;
  reservationId?: string;
  usedUnits: number;
  maxUnits: number;
} {
  const denied = (code: string) => ({
    allowed: false,
    code,
    usedUnits: context.usedUnits,
    maxUnits: context.maxUnits,
  });
  if (!bindingsMatch(request, context.binding)) {
    return denied("RELEASE_BINDING_MISMATCH");
  }
  if (context.pausedScopes.includes("all")) {
    return denied("PAUSED_ALL");
  }
  if (context.pausedScopes.includes("release")) {
    return denied("PAUSED_RELEASE");
  }
  if (context.pausedScopes.includes("modal")) {
    return denied("PAUSED_MODAL");
  }
  if (context.pausedScopes.includes("model")) {
    return denied("PAUSED_MODEL");
  }
  if (!ALLOWED_MODELS.has(request.model)) {
    return denied("MODEL_NOT_ALLOWED");
  }
  if (
    request.requestId.trim().length === 0 ||
    !Number.isInteger(request.estimatedUnits) ||
    request.estimatedUnits <= 0 ||
    request.estimatedUnits > context.maxUnits
  ) {
    return denied("INVALID_BUDGET_REQUEST");
  }
  if (
    context.existingReservation?.requestId === request.requestId &&
    (context.existingReservation.estimatedUnits !== request.estimatedUnits ||
      context.existingReservation.model !== request.model)
  ) {
    return denied("RESERVATION_MISMATCH");
  }
  if (
    context.existingReservation?.requestId === request.requestId &&
    context.existingReservation.estimatedUnits === request.estimatedUnits &&
    context.existingReservation.model === request.model
  ) {
    return {
      allowed: true,
      code: "MODEL_BUDGET_ALREADY_RESERVED",
      reservationId: request.requestId,
      usedUnits: context.usedUnits,
      maxUnits: context.maxUnits,
    };
  }
  if (context.usedUnits + request.estimatedUnits > context.maxUnits) {
    return {
      allowed: false,
      code: "MODEL_BUDGET_EXCEEDED",
      usedUnits: context.usedUnits,
      maxUnits: context.maxUnits,
    };
  }
  return {
    allowed: true,
    code: "MODEL_BUDGET_RESERVED",
    reservationId: request.requestId,
    usedUnits: context.usedUnits + request.estimatedUnits,
    maxUnits: context.maxUnits,
  };
}
