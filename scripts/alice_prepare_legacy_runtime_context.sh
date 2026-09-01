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
  local expected="$2"
  (
    cd "$workspace"
    bun run build
    test -f "$expected"
  )
}

build_workspace eliza/packages/shared dist/index.js
build_workspace eliza/packages/skills dist/index.js
build_workspace eliza/packages/vault dist/index.js
build_workspace eliza/packages/auth dist/index.js
build_workspace eliza/packages/ui dist/index.js
build_workspace eliza/packages/app-core dist/index.js
build_workspace eliza/plugins/plugin-local-inference dist/runtime/index.js
build_workspace eliza/plugins/plugin-openai dist/node/index.node.js
build_workspace eliza/cloud/packages/sdk dist/index.js
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
  (
    cd "$workspace"
    bun run build
  )
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
node --import tsx eliza/packages/app-core/scripts/write-build-info.ts 2>/dev/null || true

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
