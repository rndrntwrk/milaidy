# Milady Agent Images — Generic And Cloud Deploys

## Overview

Milady ships two Docker images:

- The canonical generic agent image, built from `Dockerfile.ci`
- A dedicated cloud-only image, built from `deploy/Dockerfile.cloud-slim`

Use the generic image for the standard Milady runtime. Use the cloud-only image
when you want a separate headless cloud instance with the bridge runtime
already baked in.

### Image Architecture

```
┌─────────────────────────────────────────┐
│  milady/agent:latest                   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Generic runtime + UI/API       │
│  └──────────────────────────────────┘   │
│                                         │
│  Base: node:22-slim + tsx               │
│  Build: Dockerfile.ci                   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ghcr.io/milady-ai/milady/agent:cloud-agent │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Headless runtime + bridge       │   │
│  │  deploy/cloud-agent-entrypoint.ts│   │
│  │  /health                         │   │
│  │  /bridge                         │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Base: node:22-bookworm-slim            │
│  Build: deploy/Dockerfile.cloud-slim    │
└─────────────────────────────────────────┘
```

### Ports

| Port  | Service                     |
|-------|-----------------------------|
| 2138  | Milady API (`MILADY_PORT`)  |
| 2139  | UI Server (`PORT`)          |
| 31337 | Dev API + WebSocket (`MILADY_API_PORT`) |
| 18790 | Compat bridge (`BRIDGE_PORT`) |

---

## Quick Start

### Build a new image

```bash
# Build the canonical agent image
docker build -f Dockerfile.ci -t milady/agent:latest .

# Build the cloud-only image
docker build -f deploy/Dockerfile.cloud-slim -t milady/agent:cloud-agent .

# Build with a specific version tag
docker build -f deploy/Dockerfile.cloud-slim -t milady/agent:cloud-agent-2.0.0-alpha.92 .
```

### Deploy to nodes

```bash
# Check current status
./deploy/deploy-to-nodes.sh --status

# List running containers
./deploy/deploy-to-nodes.sh --list

# Load image to all nodes (no restart)
./deploy/deploy-to-nodes.sh

# Load + restart all containers
./deploy/deploy-to-nodes.sh --restart

# Rolling restart (one at a time, wait for healthy)
./deploy/deploy-to-nodes.sh --restart --rolling

# Deploy to a single node
./deploy/deploy-to-nodes.sh --node agent-node-1 --restart
```

---

## Build Process

### What the build does

1. Starts from `node:22-slim`
2. Copies the prebuilt workspace into `/app`
3. Installs `tsx`
4. Starts through `scripts/container-entrypoint.mjs`
5. Uses `/health` in cloud mode and `/api/health` in normal mode

### Dockerfile

The generic image uses `Dockerfile.ci`. The cloud-only image uses
`deploy/Dockerfile.cloud-slim`.

Key points:

- **Generic image** — full Milady runtime, UI/API capable
- **Cloud image** — headless runtime tuned for separate cloud instances
- **Cloud workflow** — published by `build-cloud-image.yml`
- **Health checks** — generic uses `/api/health`, cloud uses `/health`

### Build args

| Arg | Description |
|-----|-------------|
| `MILADY_DOCKER_APT_PACKAGES` | Extra apt packages to install (optional) |
| `BUILD_VERSION` | Version tag (set by build script) |
| `BUILD_SHA` | Git commit SHA (set by build script) |

---

## Docker Nodes

### Current nodes

| Node | IP | SSH |
|------|----|----|
| agent-node-1 | 37.27.190.196 | `ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196` |
| nyx-node | 89.167.49.4 | `ssh -i ~/.ssh/clawdnet_nodes root@89.167.49.4` |

### Image transfer

Images are transferred via `docker save | ssh docker load` (no registry pull on nodes). This is because:
- The nodes don't have registry credentials configured
- Image is ~14 GB, transfer takes a few minutes over SSH
- Simple and reliable

### Container naming

Containers are named `milady-{uuid}` (e.g., `milady-b68b5ef1-fe83-48a5-8f31-1d24d7a329b1`). They're created by the Milady Cloud orchestrator.

---

## Updating Running Containers

### Safe update process

1. **Build** the new image locally
2. **Deploy** to nodes (loads image, doesn't restart)
3. **Check** current containers: `./deploy/deploy-to-nodes.sh --list`
4. **Restart** with snapshots: `./deploy/deploy-to-nodes.sh --restart --rolling`

### What `--restart` does

For each running container:
1. Creates a snapshot (`docker commit`) with timestamp
2. Inspects the container's env vars, ports, volumes, networks
3. Stops and removes the old container
4. Starts a new container with the same config but new image
5. (With `--rolling`) waits for health check to pass before next

### Manual container restart

If you need to restart a specific container:

```bash
NODE=37.27.190.196
CONTAINER=milady-b68b5ef1-fe83-48a5-8f31-1d24d7a329b1
SSH="ssh -i ~/.ssh/clawdnet_nodes root@$NODE"

# Snapshot
$SSH "docker commit $CONTAINER ${CONTAINER}-backup-$(date +%Y%m%d)"

# Get config
$SSH "docker inspect $CONTAINER" > /tmp/container-config.json

# Restart
$SSH "docker stop -t 30 $CONTAINER && docker rm $CONTAINER"
# Recreate with same env/ports (see inspect output)
```

---

## Release Workflow

### Version relationship

- Milady releases create git tags like `v2.0.0-alpha.81`
- The canonical generic image is published to `ghcr.io/milady-ai/agent`
- The cloud-only image is published to `ghcr.io/milady-ai/milady/agent:cloud-agent`
- The steward-only image was removed from the release path

### GitHub Actions (CI)

The `build-docker.yml` workflow:
- **Auto-triggers** on release tags and `develop`
- **Runs inside `Agent Release`** as the canonical image validation job
- Builds and pushes the shared agent image to GitHub Container Registry
- Uses Docker layer caching for faster rebuilds

The `build-cloud-image.yml` workflow:
- **Auto-triggers** on release tags
- **Runs inside `Agent Release`** as the cloud-only image validation job
- Builds and pushes the dedicated cloud-only image

To use the CI-built image on nodes:
```bash
# Pull the generic image from GHCR (requires login)
docker pull ghcr.io/milady-ai/agent:latest

# Pull the cloud-only image from GHCR
docker pull ghcr.io/milady-ai/milady/agent:cloud-agent

# Or build locally and transfer via SSH
docker build -f Dockerfile.ci -t milady/agent:latest .
```

### Typical update flow

```
git tag v2.0.0-alpha.82
git push origin v2.0.0-alpha.82
  → CI builds and pushes the canonical image and cloud-only image to GHCR
  → OR: docker build -f Dockerfile.ci -t milady/agent:latest . (manual)
  → OR: docker build -f deploy/Dockerfile.cloud-slim -t milady/agent:cloud-agent . (manual)
./deploy/deploy-to-nodes.sh --restart --rolling
```

---

## Troubleshooting

### Container won't start

```bash
ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196 \
  "docker logs --tail 100 milady-CONTAINER-NAME"
```

### Health check failing

The health check hits `http://localhost:$PORT/health`. Common issues:
- UI server didn't start (check entrypoint logs)
- Port conflict
- Missing env vars

### Image too large

The image is ~14 GB because it includes the full monorepo build. To reduce:
- Consider a multi-stage build that only copies dist output
- Use `.dockerignore` to exclude test files, docs, etc.

### SSH transfer slow

For large images over slow connections:
```bash
# Compress during transfer
docker save milady/agent:latest | gzip | \
  ssh -i ~/.ssh/clawdnet_nodes root@37.27.190.196 "gunzip | docker load"
```

---

## Files

| File | Description |
|------|-------------|
| `../Dockerfile.ci` | Canonical generic agent image |
| `Dockerfile.cloud-slim` | Dedicated cloud-only image |
| `../scripts/container-entrypoint.mjs` | Runtime selector used by the generic image |
| `cloud-agent-entrypoint.ts` | Cloud agent entrypoint (bridge server + runtime) |
| `deploy-to-nodes.sh` | Deploy script (push to nodes, restart containers) |
| `../.github/workflows/build-docker.yml` | CI workflow for canonical generic image builds |
| `../.github/workflows/build-cloud-image.yml` | CI workflow for cloud-only image builds |
