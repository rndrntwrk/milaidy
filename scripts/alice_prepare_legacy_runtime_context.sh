#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: alice_prepare_legacy_runtime_context.sh <subject-root>" >&2
  exit 64
fi

SUBJECT_ROOT="$(cd "$1" && pwd -P)"
: "${ALICE_EXPECTED_SOURCE_COMMIT:?ALICE_EXPECTED_SOURCE_COMMIT is required}"
: "${ALICE_EXPECTED_ELIZA_COMMIT:?ALICE_EXPECTED_ELIZA_COMMIT is required}"

if ! printf '%s' "$ALICE_EXPECTED_SOURCE_COMMIT" | grep -Eq '^[a-f0-9]{40}$'; then
  echo "invalid expected source commit" >&2
  exit 65
fi
if ! printf '%s' "$ALICE_EXPECTED_ELIZA_COMMIT" | grep -Eq '^[a-f0-9]{40}$'; then
  echo "invalid expected Eliza commit" >&2
  exit 65
fi

cd "$SUBJECT_ROOT"
test "$(git rev-parse HEAD)" = "$ALICE_EXPECTED_SOURCE_COMMIT"
test "$(git -C eliza rev-parse HEAD)" = "$ALICE_EXPECTED_ELIZA_COMMIT"
test -f eliza/package.json

node scripts/port-alice-operator-bridge.mjs
node scripts/port-alice-product-plugins.mjs

bun install --ignore-scripts --frozen-lockfile
(
  cd eliza
  bun install --ignore-scripts --frozen-lockfile
)

export ALICE_WRANGLER_BIN="$SUBJECT_ROOT/node_modules/.bin/wrangler"
export ALICE_WORKER_CONTRACT_REPLAY=1
export ALICE_REPLAY_SOURCE_COMMIT="$ALICE_EXPECTED_SOURCE_COMMIT"

bun test \
  packages/app-core/src/api/server.health-probes.test.ts \
  packages/agent/src/api/alice-production-auth-boundary.test.ts \
  packages/agent/src/api/alice-production-capabilities.test.ts \
  packages/agent/src/api/alice-production-chat.test.ts \
  packages/agent/src/api/alice-production-guard.test.ts \
  packages/agent/src/api/alice-production-proof.test.ts \
  packages/agent/src/api/alice-release-metadata.test.ts \
  packages/agent/src/runtime/alice-capability-inventory.test.ts \
  packages/agent/src/runtime/alice-production-plugin-policy.test.ts \
  packages/agent/src/runtime/alice-production-runtime-plugin.test.ts \
  packages/agent/src/runtime/alice-production-startup-guard.test.ts \
  deploy/modal/alice_production_acceptance.test.ts \
  deploy/modal/verify_alice_program_admission.test.ts \
  workers/alice-access-gateway/test/index.test.ts \
  workers/alice-production-control/test/*.test.ts \
  workers/alice-state-plane/test/*.test.ts \
  workers/alice-connector-plane/test/*.test.ts

node --test \
  deploy/modal/alice_capability_bom.test.mjs \
  deploy/modal/alice_cloudflare_container_image.test.mjs \
  deploy/modal/alice_cloudflare_bootstrap.test.mjs \
  workers/alice-ai-gateway/src/index.test.mjs \
  deploy/modal/alice_cloudflare_config.test.mjs \
  deploy/modal/alice_cloudflare_continuity.test.mjs \
  deploy/modal/alice_cloudflare_live_readback.test.mjs \
  deploy/modal/alice_cloudflare_provider_config.test.mjs \
  deploy/modal/alice_cloudflare_provider_readback.test.mjs \
  deploy/modal/alice_cloudflare_recovery_preprovision.test.mjs \
  deploy/modal/alice_program_signing_key.test.mjs \
  deploy/modal/alice_terminal_publication.test.mjs \
  deploy/modal/alice_cloudflare_release.test.mjs \
  deploy/modal/alice_cloudflare_traffic.test.mjs \
  deploy/modal/alice_cloudflare_worker_rollback.test.mjs \
  deploy/modal/alice_deployment_manifest.test.mjs \
  deploy/modal/alice_modal_promote.test.mjs \
  deploy/modal/alice_modal_release.test.mjs \
  deploy/modal/alice_modal_safe_bootstrap.test.mjs \
  deploy/modal/alice_recovery_credential_binding.test.mjs \
  deploy/modal/alice_release_controller.test.mjs \
  deploy/modal/alice_release_deadline.test.mjs \
  deploy/modal/alice_smoke_model_server.test.mjs \
  deploy/modal/verify_alice_runtime_boundary.test.mjs \
  deploy/modal/verify_alice_capability_bom.test.mjs \
  deploy/modal/write_alice_runtime_build_manifest.test.mjs \
  deploy/modal/alice_worker_bundle_artifact.test.mjs \
  deploy/modal/alice_workflow_binding_canary.test.mjs \
  scripts/deploy-alice-cloudflare-workflow.test.mjs \
  scripts/alice-capability-production-source.test.mjs \
  scripts/build-cloud-agent-workflow.test.mjs

python3 -m unittest \
  deploy.modal.test_alice_registry_runtime \
  deploy.modal.test_alice_modal_provider_readback \
  deploy.modal.test_alice_safe_bootstrap

./node_modules/.bin/wrangler types \
  --config workers/alice-production-control/wrangler.jsonc \
  --env-interface AliceEnv \
  workers/alice-production-control/worker-configuration.d.ts
./node_modules/.bin/wrangler types \
  --config workers/alice-access-gateway/wrangler.jsonc \
  --env-interface AliceAccessGatewayBindings \
  workers/alice-access-gateway/worker-configuration.d.ts
./node_modules/.bin/wrangler types \
  --config workers/alice-access-gateway/wrangler.runtime-host.jsonc \
  --env-interface AliceRuntimeHostBindings \
  workers/alice-access-gateway/runtime-host-configuration.d.ts
./node_modules/.bin/wrangler types \
  --config workers/alice-state-plane/wrangler.jsonc \
  workers/alice-state-plane/worker-configuration.d.ts
./node_modules/.bin/wrangler types \
  --config workers/alice-connector-plane/wrangler.jsonc \
  workers/alice-connector-plane/worker-configuration.d.ts

bun x tsc --project workers/alice-production-control/tsconfig.json --noEmit
bun x tsc --project workers/alice-access-gateway/tsconfig.json --noEmit
bun x tsc --project workers/alice-state-plane/tsconfig.json --noEmit
bun x tsc --project workers/alice-connector-plane/tsconfig.json --noEmit

node eliza/packages/app-core/scripts/build-native-plugins.mjs

(
  cd eliza/packages/core
  bun run build
  test -f dist/node/index.node.js
)
(
  cd eliza/packages/agent
  bun run build:docker-dist
)

rm -rf packages/agent/dist
./node_modules/.bin/tsc \
  --noCheck \
  --ignoreDeprecations 6.0 \
  -p packages/agent/tsconfig.build.json
node scripts/prepare-package-dist.mjs \
  packages/agent \
  --compiled-prefix=packages/agent/src
test -f packages/agent/dist/packages/agent/src/runtime/alice-capability-inventory.js
test -f packages/agent/dist/packages/agent/src/runtime/alice-runtime-profile.js

build_workspace() {
  local workspace="$1"
  local expected="${2:-}"
  (
    cd "$workspace"
    bun run build
    if [ -n "$expected" ]; then
      test -f "$expected"
    fi
  )
}

build_workspace eliza/packages/shared
build_workspace eliza/packages/skills dist/index.js
build_workspace eliza/packages/vault
build_workspace eliza/packages/auth
build_workspace eliza/packages/ui
build_workspace eliza/packages/app-core
build_workspace eliza/plugins/plugin-local-inference dist/runtime/index.js
build_workspace eliza/plugins/plugin-openai dist/node/index.node.js
build_workspace eliza/packages/cloud/sdk dist/index.js
build_workspace eliza/plugins/plugin-elizacloud dist/utils/config.js

for workspace in \
  eliza/plugins/plugin-agent-orchestrator \
  eliza/plugins/plugin-agent-skills \
  eliza/plugins/plugin-anthropic \
  eliza/plugins/plugin-commands \
  eliza/plugins/plugin-sql \
  eliza/plugins/plugin-app-control \
  eliza/plugins/plugin-app-manager \
  eliza/plugins/plugin-scheduling
 do
  build_workspace "$workspace"
 done

build_workspace eliza/plugins/plugin-form dist/index.js

(
  cd eliza/plugins/plugin-wallet
  bun run build || {
    test -f dist/index.mjs
    test -f dist/diagnostic.js
    bun run build:views
    echo "Using verified plugin-wallet runtime JS after declaration-only failure"
  }
)

plugins/plugin-bluebubbles/typescript/node_modules/.bin/tsc \
  -p plugins/plugin-bluebubbles/typescript/tsconfig.json \
  --noCheck
test -f plugins/plugin-bluebubbles/typescript/dist/index.js

while IFS='|' read -r workspace entrypoint
 do
  test -n "$workspace"
  test -n "$entrypoint"
  bun run --cwd "$workspace" build
  test -f "$workspace/$entrypoint"
 done <<'ALICE_POLICY_WORKSPACES'
eliza/plugins/plugin-browser|dist/index.js
eliza/plugins/plugin-capacitor-bridge|dist/index.js
eliza/plugins/plugin-coding-tools|dist/index.js
eliza/plugins/plugin-computeruse|dist/index.js
eliza/plugins/plugin-discord|dist/index.js
eliza/plugins/plugin-google-genai|dist/node/index.node.js
eliza/plugins/plugin-imessage|dist/index.js
eliza/plugins/plugin-mcp|dist/node/index.js
packages/plugin-music-library|dist/index.js
packages/plugin-music-player|dist/index.js
eliza/plugins/plugin-pdf|dist/node/index.node.js
eliza/plugins/plugin-signal|dist/index.js
eliza/plugins/plugin-telegram|dist/index.js
eliza/plugins/plugin-whatsapp|dist/index.js
eliza/plugins/plugin-workflow|dist/index.js
ALICE_POLICY_WORKSPACES

MILADY_ELIZA_APP_CORE_ROOT=packages/app-core ./node_modules/.bin/tsdown
echo '{"type":"module"}' > dist/package.json
MILADY_ELIZA_APP_CORE_ROOT=packages/app-core \
  node --import tsx eliza/packages/app-core/scripts/write-build-info.ts \
  2>/dev/null || true

(
  cd apps/app
  NODE_ENV=production \
  ALICE_RUNTIME_PROFILE=full-gated \
  MILADY_ELIZA_APP_CORE_ROOT=packages/app-core \
    bun run build:web
)

test "$(git rev-parse HEAD)" = "$ALICE_EXPECTED_SOURCE_COMMIT"
test "$(git -C eliza rev-parse HEAD)" = "$ALICE_EXPECTED_ELIZA_COMMIT"
test -f dist/package.json
test -d apps/app/dist

printf '%s\n' '{"ok":true,"kind":"alice.legacy-runtime-context-prepared.v1"}'
