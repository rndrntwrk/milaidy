# Alice production deployment on Modal

This directory is the source-owned production launcher for Alice 9. It deploys
one exact image digest and keeps no idle container (`min_containers=0`,
`buffer_containers=0`, `max_containers=1`).

## Current candidate

- Alice source: `044157c3d7d7f5dc97b7236ed4cbcfdb52d3b0b1`
- Official Eliza `develop`: `dd57a68ef1e6c28c93c9974de61d4402492a0f31`
- GitHub Actions build and exact-image smoke: `32374476301`
- Image: `ghcr.io/rndrntwrk/milaidy-agent@sha256:e19d305b2bb619c0b84cad6b44caf4b5132efaafe90883283fe4dcb8859b548f`
- Rollback target: Modal `alice-runtime` v47

The workflow was dispatched with rollout disabled. Promotion is a separate,
auditable step:

```bash
python3 -m unittest deploy/modal/test_alice_registry_runtime.py
python3 -m py_compile deploy/modal/alice_registry_runtime.py
~/.venvs/modal/bin/modal deploy deploy/modal/alice_registry_runtime.py
```

## Required post-deploy checks

1. An unauthenticated `/api/health` request returns HTTP 401.
2. An authenticated `/api/health` request returns HTTP 200 with
   `agentState=running`.
3. `/api/emotes` includes `dance-happy`.
4. `/broadcast/alice-cam` returns the Alice broadcast application.
5. `/vrms/milady-9.vrm.gz` returns the 58,021,632-byte gzip-compressed Alice 9
   asset and expands to a GLB payload.
6. Modal reports the new revision, then returns to zero running containers after
   the bounded verification window.

This targeted promotion verifies the latest-Eliza runtime surface. The complete
Stream + Alice 9 + Ads + Cloudflare encoded-composition proof is retained in the
Stream repository under `docs/runtime-evidence/alice9-managed-composition-20260820`.
