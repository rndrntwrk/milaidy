# Alice Trusted-Admin Runtime Checklist (2026-02-22)

## Objective
Verify that trusted-admin controls are active in production runtime, not only configured in source or secrets.

## Scope
This checklist validates:

1. Secret values exist.
2. Deployment injects trusted-admin env vars.
3. Running pod actually receives those env vars.
4. Runtime policy enforces trusted-admin checks on protected actions.

## Pre-check
Use the active production context:

1. `KUBECONFIG=/etc/rancher/k3s/k3s.yaml`
2. Namespace: `production`
3. Deployment: `alice-bot`

## Checklist

- [ ] **T1. Secret keys exist in `alice-secrets`**
  - Run:
    - `kubectl get secret alice-secrets -n production -o yaml | awk '/^data:/{flag=1;next}/^[^ ]/{flag=0}flag{print $1}' | sed 's/:$//' | sort | egrep 'MILAIDY_TRUSTED_ADMIN|TRUSTED_ADMIN'`
  - Pass: at least one trusted-admin key is present.

- [ ] **T2. Deployment env wiring is present**
  - Inspect:
    - `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555-bot/k8s/base/deployment.yaml`
  - Pass: trusted-admin keys are mapped via `secretKeyRef` env entries.

- [ ] **T3. Running pod contains trusted-admin env values**
  - Run:
    - `POD=$(kubectl get pods -n production -l app=alice-bot -o jsonpath='{.items[0].metadata.name}')`
    - `kubectl exec "$POD" -n production -- sh -lc 'printenv | egrep "MILAIDY_TRUSTED_ADMIN|TRUSTED_ADMIN" || true'`
  - Pass: one or more trusted-admin env vars have non-empty values.

- [ ] **T4. Trusted-admin runtime helper behavior is tested**
  - File:
    - `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/runtime/trusted-admin.test.ts`
  - Pass: tests include provider-qualified allowlist acceptance and denial cases.

- [ ] **T5. Protected actions reject untrusted callers**
  - File:
    - `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/plugins/five55-admin/index.ts`
  - Pass: protected actions call `assertTrustedAdminForAction(...)`.

- [ ] **T6. Deployment gate enforces trusted-admin presence**
  - File:
    - `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555-bot/scripts/ci/validate-alice-runtime.sh`
  - Pass: runtime validation fails when `REQUIRE_TRUSTED_ADMIN=true` and no trusted-admin env keys are present.

## One-Command Runtime Gate
From `555-bot` root:

```bash
REQUIRE_TRUSTED_ADMIN=true scripts/ci/validate-alice-runtime.sh
```

Expected final line:

1. `[alice-runtime-validate] PASS`
