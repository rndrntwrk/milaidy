export type AliceHighRiskActionId =
  | "terminal-run"
  | "custom-action-definition"
  | "custom-action-http"
  | "custom-action-code"
  | "plugin-install-uninstall"
  | "skill-marketplace-install-uninstall"
  | "wallet-signing";

export type OperatorVisibility =
  | "explicit_api_request"
  | "explicit_named_action"
  | "human_approval_required";

export interface AliceHighRiskActionEntry {
  id: AliceHighRiskActionId;
  action: string;
  owner: string;
  risk: string;
  operatorVisibility: OperatorVisibility;
  currentGuardrails: string[];
  guardrailPaths: string[];
  securityAnchors: string[];
  auditRequirements: string[];
}

export const ALICE_HIGH_RISK_ACTION_REGISTER: AliceHighRiskActionEntry[] = [
  {
    id: "terminal-run",
    action: "Server-side shell execution through /api/terminal/run",
    owner: "Milady API server + operator runtime owner",
    risk:
      "Arbitrary host command execution can mutate state, leak data, or bypass operator intent.",
    operatorVisibility: "explicit_api_request",
    currentGuardrails: [
      "Shell access can be disabled through the permissions route before terminal execution is attempted.",
      "Terminal execution can require an explicit terminal token and a client id before the server accepts a run.",
      "Commands are capped to a single line and 4096 characters, with concurrent and duration limits enforced.",
      "Sandbox mode remains the isolation owner when shell execution is routed into a sandboxed runtime path.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/api/server.ts",
      "src/api/permissions-routes.ts",
      "src/services/sandbox-manager.ts",
      "src/security/terminal-run-limits.ts",
    ],
    securityAnchors: [
      "src/security/terminal-run-limits.ts",
      "src/security/audit-log.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation for each accepted terminal run.",
      "Record deny decisions for disabled shell, invalid token, or terminal rate-limit rejection.",
    ],
  },
  {
    id: "custom-action-definition",
    action: "Create, update, test, or delete custom shell/code/http actions",
    owner: "Custom action API owner",
    risk:
      "Persistent custom actions can survive restarts and create privileged execution paths if they are not explicitly gated.",
    operatorVisibility: "explicit_api_request",
    currentGuardrails: [
      "Only http, shell, and code handlers are accepted by the API.",
      "Creating or updating shell/code handlers requires the same terminal authorization gate used for direct terminal runs.",
      "Testing shell/code handlers is also gated by terminal authorization rather than a silent background path.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/api/server.ts",
      "packages/autonomous/src/runtime/custom-actions.ts",
      "src/security/terminal-run-limits.ts",
      "src/security/network-policy.ts",
    ],
    securityAnchors: [
      "src/security/terminal-run-limits.ts",
      "src/security/network-policy.ts",
      "src/security/audit-log.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation for custom-action create, update, test, and delete operations.",
      "Record policy decisions when terminal authorization blocks shell/code action changes.",
    ],
  },
  {
    id: "custom-action-http",
    action: "HTTP custom action execution against external services",
    owner: "Custom action runtime owner",
    risk:
      "Unpinned or internal-network requests can turn a user prompt into SSRF or metadata service access.",
    operatorVisibility: "explicit_named_action",
    currentGuardrails: [
      "HTTP action targets are resolved through DNS pinning and blocked if they resolve to private, loopback, link-local, or metadata addresses.",
      "Redirects are denied to avoid bouncing from an external hostname into an internal target.",
      "Response bodies are truncated before being surfaced back into the runtime.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/runtime/custom-actions.ts",
      "src/security/network-policy.ts",
    ],
    securityAnchors: [
      "src/security/network-policy.ts",
      "src/security/audit-log.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation when a custom HTTP action reaches an external boundary.",
      "Record deny decisions when network policy blocks a host or redirect.",
    ],
  },
  {
    id: "custom-action-code",
    action: "Code custom action execution inside the runtime VM",
    owner: "Custom action runtime owner",
    risk:
      "Code handlers can issue network requests and transform operator input into privileged automation with fewer visual cues than a direct shell run.",
    operatorVisibility: "explicit_named_action",
    currentGuardrails: [
      "Code handlers run inside a constrained VM with a 30 second timeout instead of direct unrestricted module access.",
      "The exposed fetch surface is wrapped by the same network safety checks used for HTTP custom actions.",
      "Shell or code custom actions cannot be created or updated without terminal authorization.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/runtime/custom-actions.ts",
      "packages/autonomous/src/api/server.ts",
      "src/security/network-policy.ts",
      "src/security/terminal-run-limits.ts",
    ],
    securityAnchors: [
      "src/security/network-policy.ts",
      "src/security/terminal-run-limits.ts",
      "src/security/audit-log.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation for code action execution.",
      "Record deny decisions when code-action creation or testing is blocked by terminal authorization.",
    ],
  },
  {
    id: "plugin-install-uninstall",
    action: "Install or uninstall runtime plugins",
    owner: "Plugin manager + operator UI owner",
    risk:
      "Plugin lifecycle changes modify the loaded runtime surface, persist across restarts, and can introduce new code paths.",
    operatorVisibility: "explicit_api_request",
    currentGuardrails: [
      "Install requests require an explicit package name and reject invalid npm package identifiers.",
      "Plugin installs are serialized and constrained to the Milady-installed plugins directory.",
      "Runtime restart is explicit and tied to the install or uninstall result rather than hidden background mutation.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/api/server.ts",
      "src/services/plugin-installer.ts",
      "src/security/audit-log.ts",
    ],
    securityAnchors: [
      "src/security/audit-log.ts",
      "src/security/high-risk-action-register.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation for plugin install, uninstall, and eject.",
      "Record failures that change runtime shape but do not complete successfully.",
    ],
  },
  {
    id: "skill-marketplace-install-uninstall",
    action: "Install or uninstall marketplace skills",
    owner: "Skill marketplace owner",
    risk:
      "Marketplace skill ingestion adds executable guidance/artifacts into the operator workspace and can widen the action surface.",
    operatorVisibility: "explicit_api_request",
    currentGuardrails: [
      "Skill ids are validated before install or uninstall is allowed.",
      "Skills with warning or critical scan findings cannot be enabled until the findings are explicitly acknowledged.",
      "Marketplace actions refresh discovered skills after mutation so the visible state matches the workspace state.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/api/server.ts",
      "packages/autonomous/src/services/skill-marketplace.ts",
      "src/security/audit-log.ts",
    ],
    securityAnchors: [
      "src/security/audit-log.ts",
      "src/security/high-risk-action-register.ts",
    ],
    auditRequirements: [
      "Record privileged capability invocation for skill install and uninstall.",
      "Record marketplace policy decisions when a scan acknowledgment is required before enablement.",
    ],
  },
  {
    id: "wallet-signing",
    action: "Remote wallet signing and transaction approval",
    owner: "Remote signing service owner",
    risk:
      "Signing turns Alice from an advisor into a value-moving actor, so replay, rate, contract, and value controls must be explicit.",
    operatorVisibility: "human_approval_required",
    currentGuardrails: [
      "Signing requests run through chain, contract, method, value, replay, and rate-limit policy evaluation.",
      "Policy can require human confirmation globally or above a configured value threshold before signing proceeds.",
      "Submitted, rejected, approved, and expired signing paths are tracked through the audit log.",
    ],
    guardrailPaths: [
      "packages/autonomous/src/services/signing-policy.ts",
      "packages/autonomous/src/services/remote-signing-service.ts",
      "packages/autonomous/src/api/sandbox-routes.ts",
      "src/security/audit-log.ts",
    ],
    securityAnchors: [
      "src/security/audit-log.ts",
      "src/security/high-risk-action-register.ts",
    ],
    auditRequirements: [
      "Record signing submission, rejection, approval, and expiration events.",
      "Record policy updates that change signing behavior.",
    ],
  },
] as const;

export function validateAliceHighRiskActionRegister(): void {
  const ids = new Set<string>();

  for (const entry of ALICE_HIGH_RISK_ACTION_REGISTER) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate high-risk action id: ${entry.id}`);
    }
    ids.add(entry.id);

    if (!entry.owner.trim()) {
      throw new Error(`Missing owner for high-risk action: ${entry.id}`);
    }
    if (!entry.action.trim()) {
      throw new Error(`Missing action description for high-risk action: ${entry.id}`);
    }
    if (!entry.risk.trim()) {
      throw new Error(`Missing risk summary for high-risk action: ${entry.id}`);
    }
    if (entry.currentGuardrails.length === 0) {
      throw new Error(`Missing guardrails for high-risk action: ${entry.id}`);
    }
    if (entry.guardrailPaths.length === 0) {
      throw new Error(`Missing guardrail paths for high-risk action: ${entry.id}`);
    }
    if (entry.securityAnchors.length === 0) {
      throw new Error(`Missing security anchors for high-risk action: ${entry.id}`);
    }
    if (
      !entry.securityAnchors.some((anchor) =>
        anchor.startsWith("src/security/"),
      )
    ) {
      throw new Error(
        `High-risk action ${entry.id} must reference at least one src/security anchor`,
      );
    }
    if (entry.auditRequirements.length === 0) {
      throw new Error(`Missing audit requirements for high-risk action: ${entry.id}`);
    }
  }
}
