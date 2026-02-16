# Compute & Deployment Specification

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   App (UI)  │────▶│  API Server │────▶│  Autonomy   │
│   React 19  │     │   Node.js   │     │   Kernel    │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼──────┐      ┌──────▼──────┐
                    │  PGLite /   │      │  Optional   │
                    │  PostgreSQL │      │  Services   │
                    └─────────────┘      └─────────────┘
                                         (Redis, Temporal,
                                          OPA, Milvus)
```

## Deployment Modes

### Development (Default)
- In-process PGLite for persistence
- In-memory cache, workflow, policy, vector adapters
- No external dependencies

### Production
- PostgreSQL for persistence
- Optional Redis for caching
- Optional Temporal for workflow orchestration
- Optional OPA for policy evaluation
- Optional Milvus for vector storage
- Prometheus + Grafana for monitoring

## Resource Requirements

### Minimum (Development)
- CPU: 2 cores
- RAM: 2 GB
- Disk: 1 GB

### Recommended (Production)
- CPU: 4 cores
- RAM: 8 GB
- Disk: 20 GB
- PostgreSQL: 1 instance
- Prometheus: 1 instance

## Configuration

All configuration is via `MilaidyConfig.env.vars` in the agent's
character JSON. See `docs/schemas/autonomy-config.json` for the
full schema.

## Docker Compose

See `deploy/docker-compose.monitoring.yml` for monitoring stack and
`deploy/docker-compose.production.yml` for full production deployment.
