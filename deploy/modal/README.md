# Alice production deployment on Modal

This directory is the source-owned production launcher for Alice 9. It deploys
one exact image digest and keeps no idle container (`min_containers=0`,
`buffer_containers=0`, `max_containers=1`).

## Historical v48 evidence

- Alice source: `044157c3d7d7f5dc97b7236ed4cbcfdb52d3b0b1`
- Official Eliza `develop`: `dd57a68ef1e6c28c93c9974de61d4402492a0f31`
- GitHub Actions build and exact-image smoke: `32374476301`
- Image: `ghcr.io/rndrntwrk/milaidy-agent@sha256:e19d305b2bb619c0b84cad6b44caf4b5132efaafe90883283fe4dcb8859b548f`
- Rollback target: Modal `alice-runtime` v47

Modal v48 was promoted from launcher commit
`be30eaaa36741347fdf468b6247de6529f25ff2b`. The post-deploy checks passed and
the app returned to zero tasks and zero containers. The machine-readable result
is in [`release.json`](release.json).

After promotion, official Eliza `develop` advanced to
`f43d944af31d7066438f3bae249f016cc885203d`. That head is not deployed because a
fresh compiler check finds four duplicate-identifier errors in
`packages/ui/src/api/client-cloud.ts`. `dd57a68e...` is therefore the newest
official commit that passed the complete build and exact-image smoke, not a
claim that the later broken head is safe.

The workflow was dispatched with rollout disabled. Promotion is a separate,
auditable step:

```bash
python3 -m unittest \
  deploy.modal.test_alice_registry_runtime \
  deploy.modal.test_alice_modal_provider_readback
python3 -m py_compile deploy/modal/alice_registry_runtime.py
ALICE_MODAL_RELEASE_SECRET_NAME="alice-production-core-<64-character-release-digest-hex>" \
  ~/.venvs/modal/bin/modal deploy deploy/modal/alice_registry_runtime.py
```

The v48 runtime is not a coherent rollback target for Alice production core: it
predates the signed ProgramEnvelope and its paired Cloudflare control/Access
bundle. It remains historical runtime evidence only.

## Alice production core promotion

For v49 and later, create the release-digest-named secret once from ten exact
non-secret release metadata fields and four scoped runtime values; never update
or reuse it for another release. The Access gateway continuously compares the
runtime proof to the signed control-plane admission before proxying owner
traffic.

The first production-core promotion is Modal v49. After it passes direct and
Access-authenticated qualification, record its exact Cloudflare versions,
Program, deployment manifest, secret name, image digest, and build-manifest digest
as one rollback bundle. The final release is a separately committed, built, and
signed Modal v50 bundle. Completion requires exercising
`modal app rollback alice-runtime v49` and then restoring the exact v50 bundle.

## Required production-core post-deploy checks

1. Direct unauthenticated `/api/health` returns HTTP 401.
2. Direct authenticated readiness returns HTTP 200 only with
   `agentState=running`, a live runtime instance, and exact release proof.
3. A response-only authenticated chat succeeds with no tools, services, action
   planning, or background authority workers.
4. The authenticated Access surface serves only the reviewed nonce-CSP root
   chat transcript/form plus the enumerated Alice core API; unenumerated
   static/navigation paths, mutable routes, and legacy routes remain denied.
5. Cloudflare persists and recovers the durable transcript independently of a
   fresh Modal container.
6. Modal reports the exact recorded revision, then returns to zero running
   containers after the bounded verification window.

The legacy v48 checks below remain historical evidence and are not acceptance
criteria for v49 or v50.

All six gates passed for v48. The targeted emote POST also confirmed that the
Stream service is present; it correctly did not send because no production
Stream session was bound during this no-canary verification. The v47 encoded
composition evidence remains the proof of a bound-session `dance-happy` send.

That targeted v48 promotion verified its latest-Eliza runtime surface. The complete
Stream + Alice 9 + Ads + Cloudflare encoded-composition proof is retained in the
Stream repository under `docs/runtime-evidence/alice9-managed-composition-20260820`.
