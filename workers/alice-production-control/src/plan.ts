import type {
  ActionIntent,
  ReleaseAdmission,
  ReleaseBinding,
} from "./policy";

export type AlicePlan = {
  schemaVersion: "alice.plan.v1";
  planId: string;
  sessionId: string;
  actor: string;
  requestedAt: number;
  binding: ReleaseBinding;
  deploymentManifestSha256: string;
  admissionGeneration: number;
  actions: ActionIntent[];
};

const AUTONOMOUS_PLAN_ACTIONS = new Set([
  "memory.read",
  "runtime.health",
]);

function sameBinding(left: ReleaseBinding, right: ReleaseBinding): boolean {
  return (
    left?.programDigest === right.programDigest &&
    left?.releaseDigest === right.releaseDigest &&
    left?.policyHash === right.policyHash
  );
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(value);
}

export function validatePlan(
  value: unknown,
  admission: ReleaseAdmission,
  now = Date.now(),
): { ok: true } | { ok: false; code: "PLAN_NOT_ADMITTED" } {
  if (!value || typeof value !== "object") return { ok: false, code: "PLAN_NOT_ADMITTED" };
  const plan = value as AlicePlan;
  const actions = plan.actions;
  const valid =
    plan.schemaVersion === "alice.plan.v1" &&
    validIdentifier(plan.planId) &&
    validIdentifier(plan.sessionId) &&
    /^owner:sha256:[a-f0-9]{64}$/.test(plan.actor) &&
    Number.isFinite(plan.requestedAt) &&
    plan.requestedAt <= now + 30_000 &&
    plan.requestedAt >= now - 300_000 &&
    sameBinding(plan.binding, admission.binding) &&
    plan.deploymentManifestSha256 === admission.deploymentManifestSha256 &&
    /^sha256:[a-f0-9]{64}$/.test(plan.deploymentManifestSha256) &&
    plan.admissionGeneration === admission.admissionGeneration &&
    Number.isSafeInteger(plan.admissionGeneration) &&
    plan.admissionGeneration > 0 &&
    Array.isArray(actions) &&
    actions.length >= 1 &&
    // Workflow uses four fixed steps plus two per action, with one additional
    // terminal recovery step if the final checkpoint fails. Preserve that
    // failure path inside the configured 16-step production limit.
    actions.length <= 5 &&
    new Set(actions.map((action) => action.intentId)).size === actions.length &&
    new Set(actions.map((action) => action.nonce)).size === actions.length &&
    actions.every(
      (action) =>
        validIdentifier(action.intentId) &&
        AUTONOMOUS_PLAN_ACTIONS.has(action.action) &&
        typeof action.target === "string" &&
        action.target.trim().length > 0 &&
        action.target.length <= 512 &&
        /^sha256:[a-f0-9]{64}$/.test(action.argumentHash) &&
        validIdentifier(action.nonce) &&
        Number.isFinite(action.expiresAt) &&
        action.expiresAt > now &&
        action.expiresAt <= now + 600_000 &&
        sameBinding(action, admission.binding),
    );
  return valid ? { ok: true } : { ok: false, code: "PLAN_NOT_ADMITTED" };
}
