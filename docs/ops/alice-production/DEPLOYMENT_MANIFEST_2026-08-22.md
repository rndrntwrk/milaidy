# Alice production core deployment manifest

Status: implementation candidate. The canonical signed deployment manifest is
generated before promotion from the exact protected source, image, policy,
Worker effective configurations, Access-policy fingerprint, and AI Gateway
provider-settings fingerprint. A separate production attestation is written
only after provider promotion, live authenticated verification, exact provider
readback, and the rollback exercise. Neither artifact substitutes for the
other.

## Canonical source truth

- Parent repository: `rndrntwrk/milaidy`
- Protected release branch: `release/alice-production-core-2026-08-22`
- Candidate implementation branch: `feat/alice-production-core-2026-08-22`
- Candidate base: `521c1697089e43e10158acad0582f2b000514520`
- Eliza fork: `rndrntwrk/eliza`
- Intended protected Eliza merge target: `alice/runtime-stable-2026-08-22`
- Canonical reviewed Eliza source ref: `refs/pull/6/head` (PR #6; remote and
  independently reviewed, but unmerged because the one-account fork's branch
  rule requires approval from someone other than the last pusher)
- Exact Eliza gitlink: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Stream source evidence only: `d0d227d6`; Stream is not deployed or changed by
  this release.

The parent gitlink is authoritative. Neither Milady nor Eliza `develop` floats
into this release. The build workflow checks out the exact parent commit,
fetches the reviewed PR ref from the organization fork, requires it to resolve
to the exact gitlink above, and checks out that commit detached. Any PR-head
drift fails the build before dependencies or credentials are used.
The image build also pins the reviewed linux/amd64 manifests for Bun 1.3.14
(`sha256:50317d83...`) and Node 24.19.0 bookworm-slim
(`sha256:65932751...`); mutable base-image tags are not release inputs.

The Program signing authority is a controlled 3072-bit RSA key. Its private
PKCS#8 material is held outside every deployment and runtime environment in the
macOS Keychain item named only by service `alice-production-program` and account
`signing-key-pkcs8-pem-b64`; no private field is source-controlled, uploaded to
GitHub, Cloudflare, or Modal, or exposed to a deployment job. The canonical
public JWK is source-controlled at
`deploy/modal/alice-production-program-public.jwk.json` and pinned as
`sha256:b2aa16b88a789d0110f8e02521b15fd72b1d0df8873ffdfc1c7029c213825f5e`.
Release preparation signs only the exact canonical ProgramEnvelope bytes, then
provisions the public JWK, envelope, and signature. Rollback continuity retains
the same private signing boundary and uses a separately signed, tuple-bound
rollback Program/receipt; losing the Keychain item is a fail-closed signing
outage, never grounds for exporting the key into deployment credentials.

## Admitted production surfaces

| Surface | Production role | Release boundary |
|---|---|---|
| Cloudflare Worker `alice-access-gateway` | Exact owner Access JWT verification, sensitive-header stripping, scoped trusted-proxy proof, authenticated runtime ingress | Existing `alice.rndrntwrk.com/*` route; previous Worker version retained for rollback |
| Cloudflare Worker `alice-production-control` | Access JWT owner binding, signed ProgramEnvelope validation, Durable Object authority/session state, Workflows plans, Queues/DLQ, R2 evidence, pause/recovery, synchronous model budget | New route `alice.rndrntwrk.com/control/*`; `workers_dev=false` |
| Cloudflare Worker `alice-ai-gateway` | Release-bound bearer protection, model allowlist, control-plane reservation, Workers AI via native AI Gateway | Existing Worker, previous Worker version retained for rollback; prior runtime bearer must fail after promotion |
| Cloudflare AI Gateway `alice-production` | Model analytics, bounded rate/spend, no cache, no prompt/response payload retention | New Alice-only gateway |
| R2 `alice-production-evidence` | Release-scoped JSON evidence objects | Create-only object keys; queue retries and DLQ |
| Queues `alice-production-evidence-v1` and `alice-production-evidence-dlq-v1` | Evidence delivery and failure isolation | Production resources, not staging |
| Workflow `alice-production-plans` | Persisted low-risk plan authorization/retry | Autonomous action allowlist only |
| Cloudflare Container `alice-production-runtime` | Always-on complete Milady/Eliza runtime, complete Companion UI, and all Alice runtime features/plugins | One exact smoke-approved immutable image, `max_instances=1`, behind the authenticated Access gateway; no signing or custody authority |

For the authenticated Alice/Companion web launch, Cloudflare Container is the
always-on Milady/Eliza runtime behind Cloudflare Access. Modal and Railway are
excluded from this launch and are neither invoked nor required by its
materialization, admission, serving, acceptance, rollback, or forward-restore
path. The runtime remains an unprivileged proposer subordinate to Cloudflare
durable authority and receives no signing, custody, deployment, trading,
social-publishing, or funds-movement authority.

Railway is not admitted for Alice core v1. The related `555stream`
`control-plane` service is independently crashed and belongs to the separate
Stream diagnostic. This deployment neither restarts nor changes it.

## Historical/superseded launch boundary

The following Modal-first evidence and two-release v49/v50 procedure are
retained only as history. They are not inputs to, dependencies of, or fallback
authority for the Container web launch.

### Legacy evidence anchors (not a coherent rollback)

- Modal app `alice-runtime` deployed revision: v48
- Modal rollback revision: v47
- v48 image:
  `ghcr.io/rndrntwrk/milaidy-agent@sha256:e19d305b2bb619c0b84cad6b44caf4b5132efaafe90883283fe4dcb8859b548f`
- Cloudflare legacy root Worker: `alice-access-gateway`, deployment
  `2311be51-ee12-4105-ac86-7d498a40c541`, version
  `f380b84a-c470-405f-b8bf-a7a85ea2b8c0`
- Cloudflare AI Worker: `alice-ai-gateway`, deployment
  `9d749370-929f-48af-b925-565e883900de`, version
  `d99bde62-f1f3-4e15-b633-9841a9afa5b1`
- Alice root route: `alice.rndrntwrk.com/*` to `alice-access-gateway`

The legacy root reaches Cloudflare Access but fails after successful owner
authentication because its upstream origin is empty. Modal v48 also predates
the signed ProgramEnvelope, exact control-plane admission, and response-only
Alice core boundary. These versions remain historical evidence and emergency
fail-closed anchors only; they MUST NOT be described or exercised as a coherent
Alice production rollback.

## Capability state in the Container web release

The immutable runtime contains the complete Milady application, the complete
Companion UI, and all Alice feature/plugin code. Plugins are configured at
runtime; deploy-time admission must not remove, replace, or silently substitute
them. Low-risk research, retrieval, memory, drafting, chat, and health behavior
remain governed by the signed release and capability grants. Public social
actions, production deployments, merges, economic actions, signing, public
streaming, issuer/admin changes, and risk increases remain independently
policy-gated. Keeping those side effects disabled does not remove their plugin
or UI surfaces from the deployed application.

The Container receives only release-scoped runtime credentials and non-secret
attestation fields. It does not receive wallet custody, Stream destination,
capture, Cloudflare deployment, or signing authority. Inherited module and
loader search paths are discarded.

The AI gateway stores no plaintext runtime bearer. It admits a caller only when
`sha256(active release digest + ":" + bearer)` matches the deployed digest, so
the release promotion rotates the runtime bearer and proves the prior bearer is
rejected.

The authenticated root serves the complete Companion application and its chat
surface backed by the durable `/v1/chat/completions` route. Companion assets,
picture-in-picture, secondary publication UI, and every Alice feature surface
ship from the same immutable Milady image. Authorization remains enforced at
the action boundary: a visible or installed plugin does not receive ambient
authority to create an external side effect.

## Provider identity gate

Deployment uses temporary, release-specific Wrangler files rendered from the
source-controlled configs. The temporary directory is owned by the deployment
worker, expires at the end of the deployment window, and is removed after
readback; it is never a standing preview environment. Before upload, the
renderer must reproduce each signed effective-config digest exactly.

After each Worker promotion, read back the single 100% serving version, its
bindings, compatibility date, route, workers.dev/preview state, and
non-versioned observability settings from Cloudflare. The provider verifier
must reproduce the signed Access, control, or AI Worker config digest and must
reject extra/substituted bindings, split traffic, route drift, preview drift,
or observability drift. Separately, normalize and hash the live zone-scoped
Access application/policy order, exact-owner One-time PIN rule, required
device-posture rules, and
AI Gateway `alice-production` settings; both hashes must equal the signed
manifest. The post-live attestation records only hashes, version IDs, script
etags, and release provenance, never owner email or secret values.

## Qualification and rollback procedure

No staging infrastructure is provisioned. Local Worker/ledger tests and GitHub
exact-image smoke are ephemeral qualification; the smoke container and its
deterministic no-tool model stub are owned by the GitHub workflow run, expire
after ten minutes, and are removed by both the workflow trap and cleanup step.
The smoke performs a real authenticated response-only chat, asserts its exact
boundary marker and no-tool request shape, probes sensitive reads and mutations,
and compares runtime proof to the image, parent source, and Eliza gitlink.

Promotion order:

1. Merge the candidate implementation through the protected release branch.
2. Build the exact merged source with `Build Cloud Agent`,
   `skip_rollout=true`; require digest, SBOM, provenance attestation, and the
   exact-image runtime smoke.
3. Read and freeze the exact Access/AI provider settings, sign the candidate
   ProgramEnvelope, and generate its deployment manifest.
4. Create/bind Cloudflare production resources and deploy the control Worker.
5. Deploy the AI gateway and verify its previous version remains rollbackable.
6. Admit the exact imported image to the Cloudflare Container configuration
   without rebuilding or transforming it, and start at most one instance.
7. Verify Container boot, authenticated health, full Companion asset/readback,
   and one real durable chat/session recovery.
8. Deploy the source-controlled Access gateway over the existing root route,
   verify the intended authenticated API surface, complete Companion page, and
   denied unenumerated static paths,
   then exercise state recovery, Workflow
   authorization-only terminal status, budgets, evidence, pause/resume,
   capability fail-closed, and revoke behavior.
9. Record the exact working Cloudflare Worker versions, Container image and
   runtime revision, signed Program, image/build-manifest digests, and live
   evidence object keys as one indivisible rollback bundle.
10. Exercise rollback using short-lived receipts bound to the exact current and
    target Programs, epochs, policy, and rollback boundaries; then forward
    restore the candidate and repeat authenticated Companion, chat, session,
    durable recovery, PAUSE_ALL, and provenance readback.

Rollback is bundle-atomic and fail-closed. Restore the recorded Worker versions
and exact previous Container image/runtime revision under a tuple-bound,
one-use rollback receipt, then verify the previous authenticated Companion and
chat proof. Forward restoration uses a separately signed receipt and restores
the candidate Worker/Container tuple. Durable state is retained; no state,
queue, evidence object, release secret, or provider resource is deleted during
the exercise.

`PAUSE_ALL`, release pause, and Container admission pause block every new admission and every
state mutation that reaches the Authority after the pause commits. A Session
write already admitted immediately before that commit may finish;
qualification must exercise that ordering and verify that no later admission
or mutation is accepted.

Before lowering a model budget, read the current UTC-day usage and require it
to be no greater than the proposed ceiling. Otherwise retain the prior ceiling
or wait for the UTC reset; never lower the configured ceiling beneath already
used units and describe the result as active enforcement.

Direct unauthenticated liveness is limited to `/health/live`. Detailed health,
release proof, readiness, owner state, pause state, and provider attestation
are authenticated surfaces.

Resume receipts use `alice.recovery-receipt.v3`. They bind the immutable pause
identity and pause-time binding plus the exact current Program/release/policy,
deployment-manifest digest, current release epoch, and current rollback
boundary. Verification and the copy-on-write state comparison occur inside
`AliceAuthority`; only the receipt digest is persisted.

The protected deploy job never receives the control recovery key. Before the
first release run, an independent recovery operator uses the recovery
environment to install that Worker secret on the unrouted fail-closed bootstrap
version; the deploy job can only assert that the binding already exists. After
provider promotion, the separate `accept` job in
`alice-production-cloudflare-recovery` mints and immediately consumes the two
short-lived, one-use, exact-pause resume receipts required by the canary. The
production environment cannot mint them.

Terminal acceptance is published only as the final success-only step of that
recovery-operator job, after non-failing cleanup. An artifact is not proof by
itself: every consumer must fetch the GitHub workflow-run record after
completion and run `deploy/modal/alice_terminal_publication.mjs`. The verifier
rejects failed, cancelled, or incomplete runs and binds the exact source, run,
attempt, empty terminal pause set, Cloudflare rollback/live-readback digests,
the exact Container-image digest, and current-run R2
object-key delta. Consumption also
requires a new authenticated Cloudflare provider capture made after the
workflow completed and no more than five minutes before verification. Re-run
`alice_cloudflare_live_readback.mjs` against the downloaded, exact release
manifest/config and provide it as `ALICE_CURRENT_CLOUDFLARE_READBACK_PATH`.
Provide the archived, exact Container image proof as
`ALICE_CONTAINER_IMAGE_EVIDENCE_PATH` and omit both Modal evidence paths. The
verifier strictly binds its source, Cloudflare-registry digest, runtime image,
and runtime revision to the terminal acceptance artifact. The verifier compares the active
Cloudflare deployments, versions, traffic, provider fingerprints, Workflows,
bindings, account/zone and Worker identities byte-for-byte after removing only
the observation timestamp/duration. Any later rollback, forward, route change,
binding drift, autoscaler mismatch, or stale replay is terminally rejected.
