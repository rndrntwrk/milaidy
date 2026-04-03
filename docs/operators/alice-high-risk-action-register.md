# Alice High-Risk Action Register

## Purpose

Inventory the privileged actions Alice can take or mutate, name the owner for
each path, and make the guardrail path explicit so operator mode never depends
on a silent high-risk capability.

## Safety rule

No entry in this register is allowed to be `silent` in operator mode. Every
high-risk path must be one of:

- an explicit API request
- an explicit named action the operator enabled
- a human approval step

The typed source of truth lives in `src/security/high-risk-action-register.ts`.

## Register

### 1. Server-side shell execution

- Owner: Milady API server + operator runtime owner
- Privileged surface: `POST /api/terminal/run`
- Operator visibility: explicit API request
- Guardrails:
  - `src/api/permissions-routes.ts`
  - `src/security/terminal-run-limits.ts`
  - `src/services/sandbox-manager.ts`
  - `packages/autonomous/src/api/server.ts`
- Security anchors:
  - `src/security/terminal-run-limits.ts`
  - `src/security/audit-log.ts`
- Why it is high risk:
  - host command execution can mutate state, leak data, or bypass operator intent

### 2. Custom action definition changes

- Owner: Custom action API owner
- Privileged surface:
  - `POST /api/custom-actions`
  - `PUT /api/custom-actions/:id`
  - `POST /api/custom-actions/:id/test`
  - `DELETE /api/custom-actions/:id`
- Operator visibility: explicit API request
- Guardrails:
  - `packages/autonomous/src/api/server.ts`
  - `packages/autonomous/src/runtime/custom-actions.ts`
  - `src/security/terminal-run-limits.ts`
  - `src/security/network-policy.ts`
- Security anchors:
  - `src/security/terminal-run-limits.ts`
  - `src/security/network-policy.ts`
  - `src/security/audit-log.ts`
- Why it is high risk:
  - custom actions persist in config and can create privileged shell/code/http execution paths

### 3. HTTP custom action execution

- Owner: Custom action runtime owner
- Privileged surface: named runtime HTTP action
- Operator visibility: explicit named action
- Guardrails:
  - `packages/autonomous/src/runtime/custom-actions.ts`
  - `src/security/network-policy.ts`
- Security anchors:
  - `src/security/network-policy.ts`
  - `src/security/audit-log.ts`
- Why it is high risk:
  - external requests can become SSRF or metadata access if DNS pinning and private-IP blocks fail

### 4. Code custom action execution

- Owner: Custom action runtime owner
- Privileged surface: named runtime code action
- Operator visibility: explicit named action
- Guardrails:
  - `packages/autonomous/src/runtime/custom-actions.ts`
  - `packages/autonomous/src/api/server.ts`
  - `src/security/network-policy.ts`
  - `src/security/terminal-run-limits.ts`
- Security anchors:
  - `src/security/network-policy.ts`
  - `src/security/terminal-run-limits.ts`
  - `src/security/audit-log.ts`
- Why it is high risk:
  - code handlers can trigger network side effects and persist as privileged automation

### 5. Plugin install and uninstall

- Owner: Plugin manager + operator UI owner
- Privileged surface:
  - `POST /api/plugins/install`
  - `POST /api/plugins/uninstall`
  - plugin eject flow
- Operator visibility: explicit API request
- Guardrails:
  - `packages/autonomous/src/api/server.ts`
  - `src/services/plugin-installer.ts`
  - `src/security/audit-log.ts`
- Security anchors:
  - `src/security/audit-log.ts`
  - `src/security/high-risk-action-register.ts`
- Why it is high risk:
  - plugin lifecycle changes persist across restarts and widen the loaded runtime surface

### 6. Skill marketplace install and uninstall

- Owner: Skill marketplace owner
- Privileged surface:
  - `POST /api/skills/marketplace/install`
  - `POST /api/skills/marketplace/uninstall`
- Operator visibility: explicit API request
- Guardrails:
  - `packages/autonomous/src/api/server.ts`
  - `packages/autonomous/src/services/skill-marketplace.ts`
  - `src/security/audit-log.ts`
- Security anchors:
  - `src/security/audit-log.ts`
  - `src/security/high-risk-action-register.ts`
- Why it is high risk:
  - marketplace skill ingestion changes workspace behavior and can introduce new executable guidance/artifacts

### 7. Wallet signing and transaction approval

- Owner: Remote signing service owner
- Privileged surface:
  - signing request submission
  - `POST /api/sandbox/sign/approve`
- Operator visibility: human approval required
- Guardrails:
  - `packages/autonomous/src/services/signing-policy.ts`
  - `packages/autonomous/src/services/remote-signing-service.ts`
  - `packages/autonomous/src/api/sandbox-routes.ts`
  - `src/security/audit-log.ts`
- Security anchors:
  - `src/security/audit-log.ts`
  - `src/security/high-risk-action-register.ts`
- Why it is high risk:
  - signing turns Alice from an advisor into a value-moving actor

## Audit requirements

Every register entry names audit requirements even when the current runtime path
still needs fuller coverage. The minimum bar is:

- accepted privileged capability invocations are visible to operators
- denied policy decisions are visible to operators
- value-moving requests record submission, approval/rejection, and expiry

## Related docs

- `operators/alice-system-boundary`
- `operators/alice-operator-bootstrap`
- `stability/alice-evaluation-set`
