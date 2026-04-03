export type AliceConfigMatrixId =
  | "alice-local-runtime"
  | "alice-remote-runtime"
  | "alice-container-deploy"
  | "alice-managed-cloud"
  | "alice-founder-controls";

export type AliceConfigScope =
  | "local-runtime"
  | "remote-runtime"
  | "container-deploy"
  | "managed-cloud"
  | "founder-only-control";

export type AliceConfigStorageSurface =
  | "milady.json"
  | "~/.milady/.env"
  | "process-env"
  | "deploy-secret-manager"
  | "deploy/.env";

export interface AliceConfigMatrixEntry {
  id: AliceConfigMatrixId;
  scope: AliceConfigScope;
  surface: string;
  summary: string;
  setIn: AliceConfigStorageSurface[];
  configKeys: string[];
  requiredEnv: string[];
  optionalEnv: string[];
  founderOnlyControls: string[];
  repeatableCommands: string[];
  sourceAnchors: string[];
  notes: string[];
}

export const ALICE_CONFIG_MATRIX: AliceConfigMatrixEntry[] = [
  {
    id: "alice-local-runtime",
    scope: "local-runtime",
    surface: "Alice local operator runtime",
    summary:
      "Single-user local setup for `milady setup`, `milady doctor`, and `milady start` on the operator machine.",
    setIn: ["milady.json", "~/.milady/.env"],
    configKeys: [
      "env.shellEnv",
      "models.small",
      "models.large",
      "agents.defaults.workspace",
      "agents.list[]",
      "tools",
      "connectors",
    ],
    requiredEnv: [
      "ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | AI_GATEWAY_API_KEY | OLLAMA_BASE_URL | ELIZAOS_CLOUD_API_KEY",
    ],
    optionalEnv: [
      "MILADY_PROFILE",
      "MILADY_STATE_DIR",
      "MILADY_CONFIG_PATH",
      "MILADY_WORKSPACE_ROOT",
      "MILADY_PORT",
      "LOG_LEVEL",
      "MILADY_TUI_SHOW_THINKING",
    ],
    founderOnlyControls: [],
    repeatableCommands: [
      "milady setup",
      "milady doctor --no-ports",
      "milady start",
    ],
    sourceAnchors: [
      "src/config/zod-schema.ts",
      "src/config/types.milady.ts",
      "src/config/types.agents.ts",
      "docs/cli/setup.md",
      "docs/cli/environment.md",
    ],
    notes: [
      "Keep structure in `milady.json` and routine local secrets in `~/.milady/.env`.",
      "At least one model provider or Ollama endpoint must exist before `milady doctor` passes the model-key check.",
    ],
  },
  {
    id: "alice-remote-runtime",
    scope: "remote-runtime",
    surface: "Alice exposed or self-hosted backend",
    summary:
      "Remote backend reachable over HTTPS or Tailscale, with an authenticated API and repeatable state paths.",
    setIn: ["milady.json", "process-env", "deploy-secret-manager"],
    configKeys: [
      "agents.defaults.workspace",
      "gateway",
      "database",
      "connectors",
    ],
    requiredEnv: [
      "MILADY_API_BIND",
      "MILADY_API_TOKEN",
      "MILADY_ALLOWED_ORIGINS",
      "ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY | AI_GATEWAY_API_KEY | OLLAMA_BASE_URL | ELIZAOS_CLOUD_API_KEY",
    ],
    optionalEnv: [
      "POSTGRES_URL",
      "PGLITE_DATA_DIR",
      "MILADY_PAIRING_DISABLED",
      "MILADY_ALLOW_WS_QUERY_TOKEN",
    ],
    founderOnlyControls: ["MILADY_WALLET_EXPORT_TOKEN"],
    repeatableCommands: [
      "milady setup --no-wizard",
      "milady doctor --no-ports",
      "milady start",
    ],
    sourceAnchors: [
      "packages/autonomous/src/config/env-vars.ts",
      "docs/eliza-cloud-deployment.md",
      "docs/cli/doctor.md",
      "docs/cli/environment.md",
    ],
    notes: [
      "`MILADY_API_TOKEN` is a deploy secret, not a config-file secret. It is blocked from config-to-env sync on startup.",
      "If the backend is exposed beyond loopback, pairing and CORS rules must be intentional before operators connect.",
    ],
  },
  {
    id: "alice-container-deploy",
    scope: "container-deploy",
    surface: "Alice Docker and Compose deployment",
    summary:
      "Containerized gateway or API deployment with host volume mounts and explicit runtime/deploy secret boundaries.",
    setIn: ["deploy/.env", "deploy-secret-manager", "process-env"],
    configKeys: ["cloud.container", "database", "gateway"],
    requiredEnv: [
      "MILADY_GATEWAY_TOKEN",
      "MILADY_CONFIG_DIR",
      "MILADY_WORKSPACE_DIR",
    ],
    optionalEnv: [
      "MILADY_IMAGE",
      "MILADY_GATEWAY_PORT",
      "MILADY_BRIDGE_PORT",
      "MILADY_API_BIND",
      "MILADY_API_TOKEN",
      "MILADY_ALLOWED_ORIGINS",
      "MILADY_DOCKER_APT_PACKAGES",
      "MILADY_EXTRA_MOUNTS",
      "MILADY_HOME_VOLUME",
      "POSTGRES_URL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "AI_GATEWAY_API_KEY",
      "ELIZAOS_CLOUD_API_KEY",
    ],
    founderOnlyControls: ["MILADY_WALLET_EXPORT_TOKEN"],
    repeatableCommands: [
      "cd deploy && ./docker-setup.sh",
      "docker compose up -d",
      "docker compose logs -f milady-gateway",
    ],
    sourceAnchors: [
      "docs/deployment.mdx",
      "deploy/docker-setup.sh",
      "deploy/docker-compose.yml",
      "deploy/Dockerfile",
    ],
    notes: [
      "Use `deploy/.env` for compose wiring and secret-manager or process env for tokens that should not persist in repository-local files.",
      "Provider keys are runtime secrets; gateway and export tokens are deploy-only secrets for the exposed service boundary.",
    ],
  },
  {
    id: "alice-managed-cloud",
    scope: "managed-cloud",
    surface: "Alice managed cloud and Eliza Cloud integration",
    summary:
      "Cloud-backed inference or managed-agent attachment where Milady delegates part of runtime behavior to Eliza Cloud.",
    setIn: ["milady.json", "~/.milady/.env", "deploy-secret-manager"],
    configKeys: [
      "cloud.enabled",
      "cloud.provider",
      "cloud.baseUrl",
      "cloud.inferenceMode",
      "cloud.runtime",
      "cloud.services",
    ],
    requiredEnv: ["ELIZAOS_CLOUD_API_KEY"],
    optionalEnv: [
      "ELIZAOS_CLOUD_ENABLED",
      "ELIZAOS_CLOUD_BASE_URL",
      "ELIZAOS_CLOUD_SMALL_MODEL",
      "ELIZAOS_CLOUD_LARGE_MODEL",
    ],
    founderOnlyControls: [],
    repeatableCommands: [
      "milady setup --no-wizard",
      "milady doctor --no-ports",
      "milady start",
    ],
    sourceAnchors: [
      "packages/autonomous/src/config/types.milady.ts",
      "docs/eliza-cloud-deployment.md",
      "docs/cli/environment.md",
      "docs/deployment.mdx",
    ],
    notes: [
      "Local onboarding may cache cloud settings in config, but hosted environments should still provision cloud API keys through a deploy secret manager.",
      "Cloud runtime and local runtime should not mix conflicting provider secrets without a deliberate `cloud.inferenceMode` choice.",
    ],
  },
  {
    id: "alice-founder-controls",
    scope: "founder-only-control",
    surface: "Founder-only and high-blast-radius controls",
    summary:
      "Secrets and controls that should be restricted to founders or infra owners because they grant repo, wallet, export, or database authority.",
    setIn: ["process-env", "deploy-secret-manager"],
    configKeys: ["registry", "x402"],
    requiredEnv: [],
    optionalEnv: [],
    founderOnlyControls: [
      "GITHUB_TOKEN",
      "MILADY_WALLET_EXPORT_TOKEN",
      "EVM_PRIVATE_KEY",
      "SOLANA_PRIVATE_KEY",
      "POSTGRES_URL",
      "DATABASE_URL",
      "SKILLSMP_API_KEY",
    ],
    repeatableCommands: [
      "milady doctor --no-ports",
      "milady start",
    ],
    sourceAnchors: [
      "packages/autonomous/src/config/env-vars.ts",
      "docs/SECURITY.md",
      "docs/cli/environment.md",
      "docs/deployment.mdx",
    ],
    notes: [
      "Most of these keys are blocked from config-to-env sync by startup policy and must never be relied on through `milady.json`.",
      "Treat `SKILLSMP_API_KEY` as founder-only on shared or hosted environments even though it is not in the startup blocklist.",
    ],
  },
] as const;

export function validateAliceConfigMatrix(): void {
  const ids = new Set<string>();

  for (const entry of ALICE_CONFIG_MATRIX) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate Alice config matrix id: ${entry.id}`);
    }
    ids.add(entry.id);

    if (!entry.surface.trim()) {
      throw new Error(`Missing surface label for config matrix entry: ${entry.id}`);
    }
    if (!entry.summary.trim()) {
      throw new Error(`Missing summary for config matrix entry: ${entry.id}`);
    }
    if (entry.setIn.length === 0) {
      throw new Error(`Missing storage surfaces for config matrix entry: ${entry.id}`);
    }
    if (entry.sourceAnchors.length === 0) {
      throw new Error(`Missing source anchors for config matrix entry: ${entry.id}`);
    }
    if (entry.repeatableCommands.length === 0) {
      throw new Error(
        `Missing repeatable commands for config matrix entry: ${entry.id}`,
      );
    }
    if (
      entry.requiredEnv.length === 0 &&
      entry.optionalEnv.length === 0 &&
      entry.founderOnlyControls.length === 0
    ) {
      throw new Error(
        `Config matrix entry ${entry.id} must describe at least one environment surface`,
      );
    }
  }
}
