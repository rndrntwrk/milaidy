---
title: "Alice Config and Env Matrix"
sidebarTitle: "config/env matrix"
description: "Single source of truth for where Alice configuration lives: milady.json, local .env, deploy secrets, and founder-only controls."
---

# Alice Config and Env Matrix

Use this page before editing `~/.milady/milady.json`, `~/.milady/.env`, or any
deploy secret store. The goal is simple:

- `milady.json` stores structure and repeatable defaults
- `~/.milady/.env` stores routine local runtime secrets
- deploy secret stores or process env carry exposed-backend and deployment
  secrets
- founder-only controls stay out of operator-managed config surfaces

The typed source of truth lives in `src/config/alice-config-matrix.ts`.

## Storage rules

| Surface | Use for | Do not use for |
| --- | --- | --- |
| `~/.milady/milady.json` | workspace paths, agent defaults, model selection, connectors, cloud mode, gateway/database structure | high-blast-radius secrets that startup blocks from config-to-env sync |
| `~/.milady/.env` | local operator runtime secrets such as provider API keys | deploy-only tokens for exposed services |
| deploy secret manager / process env | public-backend auth tokens, database URLs, wallet keys, export tokens, hosted cloud secrets | checked-in examples or copied local config defaults |
| founder-only secret store | repo tokens, wallet keys, export tokens, marketplace or infra authority | day-to-day operator setup |

## Product matrix

### 1. Alice local operator runtime

Use this surface for local `setup`, `doctor`, and `start`.

| Field | Value |
| --- | --- |
| Set in | `milady.json`, `~/.milady/.env` |
| Config keys | `env.shellEnv`, `models.small`, `models.large`, `agents.defaults.workspace`, `agents.list[]`, `tools`, `connectors` |
| Required env | one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`, `OLLAMA_BASE_URL`, `ELIZAOS_CLOUD_API_KEY` |
| Optional env | `MILADY_PROFILE`, `MILADY_STATE_DIR`, `MILADY_CONFIG_PATH`, `MILADY_WORKSPACE_ROOT`, `MILADY_PORT`, `LOG_LEVEL`, `MILADY_TUI_SHOW_THINKING` |
| Repeatable path | `milady setup` -> `milady doctor --no-ports` -> `milady start` |

Notes:
- Keep local structure in config and provider secrets in `~/.milady/.env`.
- `doctor` expects a valid config file plus at least one provider or Ollama endpoint.

### 2. Alice exposed or self-hosted backend

Use this surface when the backend is reachable remotely and the API is not
loopback-only.

| Field | Value |
| --- | --- |
| Set in | `milady.json`, process env, deploy secret manager |
| Config keys | `agents.defaults.workspace`, `gateway`, `database`, `connectors` |
| Required env | `MILADY_API_BIND`, `MILADY_API_TOKEN`, `MILADY_ALLOWED_ORIGINS`, plus one provider key or `OLLAMA_BASE_URL` |
| Optional env | `POSTGRES_URL`, `PGLITE_DATA_DIR`, `MILADY_PAIRING_DISABLED`, `MILADY_ALLOW_WS_QUERY_TOKEN` |
| Founder-only control on this surface | `MILADY_WALLET_EXPORT_TOKEN` |
| Repeatable path | `milady setup --no-wizard` -> `milady doctor --no-ports` -> `milady start` |

Notes:
- `MILADY_API_TOKEN` is a deploy secret, not a config-file secret.
- If the backend is exposed beyond loopback, pair token, bind, and CORS settings together. Do not configure them independently.

### 3. Alice Docker and Compose deployment

Use this surface for the repository deployment flow under `deploy/`.

| Field | Value |
| --- | --- |
| Set in | `deploy/.env`, deploy secret manager, process env |
| Config keys | `cloud.container`, `database`, `gateway` |
| Required env | `MILADY_GATEWAY_TOKEN`, `MILADY_CONFIG_DIR`, `MILADY_WORKSPACE_DIR` |
| Optional env | `MILADY_IMAGE`, `MILADY_GATEWAY_PORT`, `MILADY_BRIDGE_PORT`, `MILADY_API_BIND`, `MILADY_API_TOKEN`, `MILADY_ALLOWED_ORIGINS`, `MILADY_DOCKER_APT_PACKAGES`, `MILADY_EXTRA_MOUNTS`, `MILADY_HOME_VOLUME`, `POSTGRES_URL`, provider keys, `ELIZAOS_CLOUD_API_KEY` |
| Founder-only control on this surface | `MILADY_WALLET_EXPORT_TOKEN` |
| Repeatable path | `cd deploy && ./docker-setup.sh` -> `docker compose up -d` -> `docker compose logs -f milady-gateway` |

Notes:
- Compose wiring belongs in `deploy/.env`.
- Exposed-service tokens and database URLs still belong in the deploy secret path, not in checked-in examples.

### 4. Alice managed cloud and Eliza Cloud integration

Use this surface when Alice should use Eliza Cloud inference or attach to a
managed cloud agent.

| Field | Value |
| --- | --- |
| Set in | `milady.json`, `~/.milady/.env`, deploy secret manager |
| Config keys | `cloud.enabled`, `cloud.provider`, `cloud.baseUrl`, `cloud.inferenceMode`, `cloud.runtime`, `cloud.services` |
| Required env | `ELIZAOS_CLOUD_API_KEY` |
| Optional env | `ELIZAOS_CLOUD_ENABLED`, `ELIZAOS_CLOUD_BASE_URL`, `ELIZAOS_CLOUD_SMALL_MODEL`, `ELIZAOS_CLOUD_LARGE_MODEL` |
| Repeatable path | `milady setup --no-wizard` -> `milady doctor --no-ports` -> `milady start` |

Notes:
- Local onboarding may cache cloud settings in config, but hosted deployments should still provision the API key as a secret.
- Pick one inference mode deliberately. Do not mix local and cloud credentials without an explicit `cloud.inferenceMode` decision.

### 5. Founder-only and high-blast-radius controls

These controls should not be treated as normal operator configuration.

| Control class | Keys |
| --- | --- |
| Repo / issue authority | `GITHUB_TOKEN` |
| Wallet / value movement | `EVM_PRIVATE_KEY`, `SOLANA_PRIVATE_KEY` |
| Export or API authority | `MILADY_WALLET_EXPORT_TOKEN` |
| Database authority | `POSTGRES_URL`, `DATABASE_URL` |
| Marketplace / infra authority | `SKILLSMP_API_KEY` |

Notes:
- Most of these keys are blocked from config-to-env sync by startup policy in `packages/autonomous/src/config/env-vars.ts`.
- Treat them as secret-manager values, not as routine `milady.json` or local `.env` content.

## Minimum repeatable paths

### Local operator path

```bash
milady setup
milady doctor --no-ports
milady start
```

The only secret requirement is one valid provider key or local model endpoint.

### Exposed backend path

```bash
export MILADY_API_BIND=0.0.0.0
export MILADY_API_TOKEN="$(openssl rand -hex 32)"
export MILADY_ALLOWED_ORIGINS="https://app.milady.ai"
milady doctor --no-ports
milady start
```

Add `POSTGRES_URL` only if the runtime should use Postgres instead of PGLite.

### Docker deploy path

```bash
cd deploy
./docker-setup.sh
docker compose up -d
```

Populate `deploy/.env` for compose wiring, and keep deploy-only tokens in the
runtime environment or secret manager used to launch Compose.

## Related docs

- `cli/setup`
- `cli/environment`
- `deployment`
- `operators/alice-high-risk-action-register`
