# Docker

How Milady's Docker images are built, what files are involved, and when to use them.

## Image Overview

Milady produces two Docker images:

| Image | Dockerfile | Published To | Purpose |
|-------|-----------|-------------|---------|
| **Agent** (main) | `Dockerfile.ci` | `ghcr.io/milady-ai/milady/agent:dev`, `:latest`, `:v{version}` | Full Milady runtime with API, UI, and all plugins |
| **Cloud Agent** (child) | `deploy/Dockerfile.cloud-agent` | Internal (not pushed to registry by default) | Subordinate agent for Eliza Cloud orchestration |

There is only one production Dockerfile: **`Dockerfile.ci`**. Both the main agent image and the cloud-app variant are built from it.

## File Map

### Core (required)

```
Dockerfile.ci                    # Canonical production image (slim Debian + Bun)
.dockerignore                    # Default ignore for local dev builds
.dockerignore.ci                 # CI-specific ignore (includes pre-built dist/)
scripts/docker-entrypoint.sh     # Container entrypoint (syncs PORT env)
scripts/docker-ci-smoke.sh       # CI smoke test (builds + boots + health probe)
scripts/docker-contract.test.ts  # Contract tests (base image, CMD, ports, labels)
scripts/build-image.sh           # Local build helper
```

### Cloud Deployment

```
deploy/Dockerfile.cloud-agent    # Child agent image for Eliza Cloud
deploy/cloud-agent-entrypoint.ts # Cloud agent entrypoint
deploy/cloud-agent-shared.ts     # Shared cloud agent runtime logic
deploy/cloud-agent-template/     # Workspace package for cloud orchestrator
deploy/docker-compose.yml        # On-premise gateway compose
deploy/docker-compose.supabase-db.yml  # Local Postgres via Supabase
deploy/docker-setup.sh           # On-premise setup helper
deploy/README.md                 # Deployment documentation
```

### Sandbox (optional, manual)

```
deploy/Dockerfile.sandbox        # Code execution sandbox (manual setup only)
scripts/sandbox-setup.sh         # Builds sandbox image locally
```

### CI Workflows

```
.github/workflows/build-docker.yml       # Builds + pushes agent image to GHCR
.github/workflows/build-cloud-image.yml  # Builds + pushes cloud-app variant
.github/workflows/docker-ci-smoke.yml    # Smoke tests the image on every push
```

## Building Locally

```bash
# Quick local build
bash scripts/build-image.sh --tag milady:local

# Manual build
bun run build                                    # Build runtime + UI
cp .dockerignore.ci .dockerignore                # Use CI ignore (includes dist/)
docker build -f Dockerfile.ci -t milady:local .  # Build image
```

## How CI Builds Work

All three workflows follow the same pattern:

1. `bun install --ignore-scripts` (fast, no native deps)
2. `bun run postinstall` (patches broken upstream packages)
3. Build runtime (`tsdown`), UI (`vite`), Capacitor plugins
4. Copy `.dockerignore.ci` over `.dockerignore`
5. `docker build -f Dockerfile.ci`

The `.dockerignore.ci` is different from the default `.dockerignore` because CI pre-builds `dist/` artifacts that need to be included in the Docker context.

## When Each Workflow Runs

| Workflow | Trigger | Image Tag |
|----------|---------|-----------|
| `docker-ci-smoke.yml` | Push to `develop`, PRs | Local only (not pushed) |
| `build-docker.yml` | Release tags, `develop` push, manual | `:dev`, `:latest`, `:v{version}` |
| `build-cloud-image.yml` | Release tags, manual | `:cloud-app`, `:cloud-app-{version}` |

## Container Runtime

The entrypoint (`scripts/docker-entrypoint.sh`) syncs environment variables:
- `PORT` -> `MILADY_PORT` (Railway/Render convention)
- Starts Milady via `node milady.mjs start`

Default exposed port: **2138**

```bash
docker run -p 2138:2138 -e ANTHROPIC_API_KEY=sk-... ghcr.io/milady-ai/milady/agent:dev
```

## On-Premise Deployment

```bash
cd deploy
bash docker-setup.sh           # Interactive setup
docker compose up -d           # Start gateway + agent
```

See `deploy/README.md` for full on-premise documentation.
