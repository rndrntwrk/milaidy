# Depot CI — operating guide

Milady uses [Depot](https://depot.dev) in two complementary roles:

1. **Docker image builds** (`.github/workflows/build-docker.yml`) — offloaded to
   Depot via `depot/build-push-action@v1`. Gives us a persistent cross-build
   layer cache, a proper BuildKit backend (vs the fragile GHA docker daemon),
   and push-directly-from-Depot to GHCR.
2. **Depot CI mirror workflows** (`.depot/workflows/`) — an auto-generated
   parallel copy of `.github/workflows/` that runs on Depot's own runner fleet.
   We **selectively** keep mirrors for compute-heavy workflows and **delete**
   mirrors for fast/auth-sensitive ones to avoid paying 2× CI cost.

Depot project ID: **`m89t0f0p08`** (`miladyAI`). Stored at `depot.json`.

---

## Configuration surface

| File | Purpose |
|---|---|
| `depot.json` | Depot project binding (`{ "id": "m89t0f0p08" }`) |
| `.depot/workflows/*.yml` | Auto-generated mirror of `.github/workflows/` |
| `.depot/migrate-config.yaml` | Advisory skip list — workflows we do **not** want mirrored |
| `scripts/depot-ci-sync.mjs` | Sync helper: runs `depot ci migrate` + applies skip list |
| `DEPOT_TOKEN` (GH repo secret) | Required for `depot/build-push-action@v1` and CLI access |

---

## Required secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

- `DEPOT_TOKEN` — project-scoped token for `milady-ai/milady` → project `m89t0f0p08`.
  Mint at <https://depot.dev/orgs/.../settings/api-tokens> with scope **project: miladyAI**.

Rotate the token any time the Depot dashboard flags it as compromised or when
someone with access leaves. After rotating:

```bash
gh secret set DEPOT_TOKEN --repo milady-ai/milady --body "<new-token>"
```

---

## Regenerating the Depot mirror safely

**Never run `depot ci migrate workflows --overwrite` by hand.** The wrapper below
regenerates the mirror and re-applies the skip list from `.depot/migrate-config.yaml`:

```bash
# Preview what would change:
node scripts/depot-ci-sync.mjs --dry-run

# Apply:
node scripts/depot-ci-sync.mjs
```

The skip list currently opts these workflows out of Depot CI:

| Workflow | Reason |
|---|---|
| `ci.yml` | Fast lint/typecheck/format jobs (<3min); Depot overhead not worth it |
| `auto-label.yml` | Thin `gh` CLI glue |
| `run-prr.yml` | Thin `gh` CLI glue |
| `agent-review.yml` | Bot-triggered review workflow |
| `agent-fix-ci.yml` | Bot-triggered fix workflow |
| `publish-npm.yml` | Release-credential workflow — keep on canonical GHA for OIDC/secret predictability |

If you want to add or remove an entry, edit `skip:` in
`.depot/migrate-config.yaml` and re-run the sync script.

---

## Pinning runner labels in source

The Depot mirror generator rewrites `ubuntu-latest` → `depot-ubuntu-latest` and
(in older generator versions) `macos-latest` → `depot-ubuntu-latest`, which
breaks Xcode-dependent jobs. **Always pin labels in the source workflow** so
the mirror copies them verbatim:

- **Ubuntu**: `runs-on: ubuntu-24.04` (not `ubuntu-latest`)
- **macOS**: `runs-on: macos-14` or `macos-15` (not `macos-latest`) — these
  pass through Depot unchanged to GitHub-hosted runners
- **Depot runners** (when you explicitly want one): `runs-on: depot-ubuntu-24.04`

The current macOS pinning lives in:

- `.github/workflows/test.yml` — `website-blocker-mobile-ios`, `website-blocker-desktop-smoke`
- `.github/workflows/mobile-build-smoke.yml` — `build-ios`

---

## Docker build troubleshooting

**Symptom: `depot: command not found` in GHA**
- Missing `- uses: depot/setup-action@v1` step before the build step.

**Symptom: `Error: DEPOT_TOKEN is required`**
- Repo secret not set. See **Required secrets** above.

**Symptom: Depot build succeeds but GHCR push returns 403 Forbidden**
- The job is running on a branch where `GITHUB_TOKEN` lacks `packages: write`.
  Check `permissions:` at the workflow level — `build-docker.yml` sets both
  `packages: write` and `id-token: write`.

**Symptom: Build is slow on first run after a big Dockerfile change**
- Expected: layer cache misses. Subsequent builds will be fast again.
- If layer cache appears permanently broken:
  ```bash
  depot cache reset --project m89t0f0p08
  ```

---

## Local Docker builds against the Depot cache

Developers can optionally run Docker builds through Depot locally to share the
CI layer cache (instant pulls of cached layers):

```bash
depot configure-docker
export DEPOT_PROJECT_ID=m89t0f0p08
# Now `docker build` is routed through Depot:
docker build -f eliza/packages/app-core/deploy/Dockerfile.ci .
```

Undo with `depot configure-docker --uninstall`.

---

## Out-of-scope / future work

- Migrating Electrobun matrix to Depot CI — macOS-only workflows pass through
  to GitHub-hosted runners anyway, so Depot adds no value here.
- Full `depot ci` beta migration for remaining mirrored workflows
  (`release-electrobun`, `scenario-matrix`, etc.). Evaluate after the Docker
  migration has been stable for a few weeks.
