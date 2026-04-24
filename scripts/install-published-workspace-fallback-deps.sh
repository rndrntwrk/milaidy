#!/usr/bin/env bash
set -euo pipefail

read_package_spec_from_manifest() {
  local package_name="$1"
  local manifest="$2"
  [[ -f "$manifest" ]] || return 1

  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const packageName = process.argv[2];

    if (pkg.name === packageName && typeof pkg.version === "string") {
      process.stdout.write(pkg.version);
      process.exit(0);
    }

    const dependencyFields = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ];

    for (const field of dependencyFields) {
      const spec = pkg[field]?.[packageName];
      if (typeof spec === "string") {
        process.stdout.write(spec);
        process.exit(0);
      }
    }
  ' "$manifest" "$package_name"
}

# Reads the pinned spec for `dep_name` from a manifest's dependencies /
# devDependencies / peerDependencies. Used when the version we want is NOT
# the manifest's own `version` field (e.g. viem is a transitive third-party
# dep declared in eliza/packages/agent; reading the manifest's own version
# yields @elizaos's alpha version and produces a non-existent specifier like
# `viem@2.0.0-alpha.177`).
read_dependency_spec_from_manifest() {
  local manifest="$1"
  local dep_name="$2"
  [[ -f "$manifest" ]] || return 1

  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const dep =
      pkg.dependencies?.[process.argv[2]] ??
      pkg.devDependencies?.[process.argv[2]] ??
      pkg.peerDependencies?.[process.argv[2]] ??
      pkg.optionalDependencies?.[process.argv[2]];
    if (typeof dep === "string" && dep.length > 0) {
      process.stdout.write(dep);
    }
  ' "$manifest" "$dep_name"
}

append_versioned_package() {
  local package_name="$1"
  shift

  local manifest spec
  for manifest in "$@"; do
    if spec="$(read_package_spec_from_manifest "$package_name" "$manifest" 2>/dev/null)" && [[ -n "$spec" ]]; then
      packages+=("${package_name}@${spec}")
      return 0
    fi
  done

  packages+=("$package_name")
}

# Like append_versioned_package, but reads the pinned spec for `package_name`
# from each manifest's dependencies section rather than the manifest's own
# `version` field. For transitive third-party deps (viem, pathe, etc.) that
# we want to install at whatever range the source manifest declared.
append_dependency_spec_package() {
  local package_name="$1"
  shift

  local manifest spec
  for manifest in "$@"; do
    if spec="$(read_dependency_spec_from_manifest "$manifest" "$package_name" 2>/dev/null)" && [[ -n "$spec" ]]; then
      packages+=("${package_name}@${spec}")
      return 0
    fi
  done

  packages+=("$package_name")
}

# Append every third-party dependency from a manifest's `dependencies` section,
# preserving the manifest's pinned spec. Used to keep package builds (e.g.
# eliza/packages/typescript) functional after disable-local-eliza-workspace
# drops them from the root workspace graph: their transitive third-party deps
# are no longer installed at root, but the build still bundles them.
#
# Skips any spec that starts with `workspace:` or `file:` since those only
# resolve in-workspace.
append_third_party_dependencies_from_manifest() {
  local manifest="$1"
  [[ -f "$manifest" ]] || return 0

  local entries
  entries="$(node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const deps = pkg.dependencies ?? {};
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string" || spec.length === 0) continue;
      if (spec.startsWith("workspace:") || spec.startsWith("file:")) continue;
      process.stdout.write(name + "\t" + spec + "\n");
    }
  ' "$manifest")"

  while IFS=$'\t' read -r name spec; do
    [[ -z "$name" ]] && continue
    packages+=("${name}@${spec}")
  done <<< "$entries"
}

symlink_installed_packages_into_manifest_node_modules() {
  local manifest="$1"
  [[ -f "$manifest" ]] || return 0

  local package_dir target_node_modules entries
  package_dir="$(dirname "$manifest")"
  target_node_modules="$package_dir/node_modules"
  mkdir -p "$target_node_modules"

  entries="$(node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const dependencyFields = ["dependencies", "devDependencies"];
    const seen = new Set();

    for (const field of dependencyFields) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
        if (typeof spec !== "string" || spec.length === 0) continue;
        if (spec.startsWith("workspace:") || spec.startsWith("file:")) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        process.stdout.write(name + "\n");
      }
    }
  ' "$manifest")"

  while IFS= read -r package_name; do
    [[ -z "$package_name" ]] && continue

    local source_path="node_modules/$package_name"
    local target_path="$target_node_modules/$package_name"
    [[ -e "$source_path" || -L "$source_path" ]] || continue

    mkdir -p "$(dirname "$target_path")"
    rm -rf "$target_path"
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*)
        cp -LR "$source_path" "$target_path"
        ;;
      *)
        ln -sfn "$(pwd)/$source_path" "$target_path"
        ;;
    esac
  done <<< "$entries"
}

packages=(
  react
  react-dom
  vite
  electrobun
  @types/react
  @types/react-dom
  @types/three
  tailwindcss
  three
  clsx
  class-variance-authority
  tailwind-merge
  sonner
  @radix-ui/react-checkbox
  @radix-ui/react-dialog
  @radix-ui/react-dropdown-menu
  @radix-ui/react-label
  @radix-ui/react-popover
  @radix-ui/react-select
  @radix-ui/react-separator
  @radix-ui/react-slider
  @radix-ui/react-slot
  @radix-ui/react-switch
  @radix-ui/react-tabs
  @radix-ui/react-tooltip
  @capacitor/core
  @capacitor/haptics
  @capacitor/keyboard
  @capacitor/preferences
  @xterm/xterm
  @xterm/addon-fit
  @xyflow/react
  cron-parser
  undici
  playwright-core
)

# Published-only CI rewrites the workspace graph before install, which can leave
# pack/build-time packages absent from root node_modules even though app-core
# still imports/bundles them during release checks.
append_versioned_package \
  "@elizaos/shared" \
  "eliza/packages/shared/package.json" \
  ".eliza.ci-disabled/packages/shared/package.json"
append_versioned_package \
  "@elizaos/ui" \
  "eliza/packages/ui/package.json" \
  ".eliza.ci-disabled/packages/ui/package.json"
append_versioned_package \
  "@elizaos/plugin-agent-orchestrator" \
  "eliza/plugins/plugin-agent-orchestrator/package.json" \
  ".eliza.ci-disabled/plugins/plugin-agent-orchestrator/package.json"

# coding-agent-adapters is a transitive dep of eliza/packages/agent's server.ts.
# After disable-local-eliza-workspace drops eliza/packages/agent from the
# workspace, its transitive deps don't get installed — but the Docker CI smoke
# still bundles eliza/packages/agent/src/api/server.ts via the apps/app alias,
# which fails with "Rolldown failed to resolve import coding-agent-adapters".
# Pin at the version eliza/packages/agent declares; falls back to latest if
# the manifest isn't available.
packages+=("coding-agent-adapters@0.16.3")

# viem is a transitive dep of eliza/packages/agent's cloud/cloud-wallet.ts
# (imports viem/accounts). Same pattern as coding-agent-adapters: dropped from
# the root install by disable-local-eliza-workspace but still bundled by the
# Docker CI smoke through the apps/app alias, producing "Rolldown failed to
# resolve import viem/accounts".
#
# Must read viem's pinned spec from eliza/packages/agent's `dependencies`,
# NOT the manifest's own `version` field — that field is @elizaos's alpha
# version (e.g. 2.0.0-alpha.177) and produces a non-existent `viem@...`
# specifier that fails `bun add` with ENOENT.
append_dependency_spec_package \
  "viem" \
  "eliza/packages/agent/package.json" \
  ".eliza.ci-disabled/packages/agent/package.json"

# eliza/packages/typescript (@elizaos/core) is rebuilt from source in the
# cloud-image and snap pipelines so the local agent-orchestrator override is
# included. After disable-local-eliza-workspace removes the package from the
# root workspace, its third-party dependencies (handlebars, dedent, @noble/*,
# @ai-sdk/*, etc.) are no longer installed at root, and the bundle fails with
# "Could not resolve: <pkg>. Maybe you need to bun install?".
append_third_party_dependencies_from_manifest \
  "eliza/packages/typescript/package.json"
# Fallback path used after disable-local-eliza-workspace renames the dir.
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/typescript/package.json"

# eliza/packages/app-core is rebuilt from source in the cloud-image and
# Docker CI Smoke pipelines (Vite bundle). Its third-party deps — e.g.
# @xyflow/react, cron-parser, radix-ui, recharts — are dropped from the
# root install by disable-local-eliza-workspace, so the bundler fails with
# "Rolldown failed to resolve import <pkg>" when Vite walks its source.
append_third_party_dependencies_from_manifest \
  "eliza/packages/app-core/package.json"
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/app-core/package.json"

# @elizaos/core's declaration build expects the explicit `bun-types` ambient
# library named in tsconfig, plus the @types/bun package used by the source
# workspace. Both disappear when the local workspace is disabled.
append_dependency_spec_package \
  "bun-types" \
  "eliza/package.json" \
  ".eliza.ci-disabled/package.json" \
  "apps/app/package.json"
append_dependency_spec_package \
  "@types/bun" \
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"
append_dependency_spec_package \
  "@types/fast-redact" \
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"
append_dependency_spec_package \
  "@types/markdown-it" \
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"

for attempt in 1 2 3; do
  if bun add --no-save --dev --ignore-scripts "${packages[@]}"; then
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/packages/typescript/package.json"
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/packages/typescript/package.json"

    # @types/uuid shadows uuid@13's bundled types and makes TS report that
    # v4/v5 do not exist. Remove the stale package anywhere the core build can
    # resolve it so the runtime package supplies its own declarations instead.
    for uuid_types_dir in \
      node_modules/@types/uuid \
      eliza/node_modules/@types/uuid \
      eliza/packages/typescript/node_modules/@types/uuid \
      .eliza.ci-disabled/node_modules/@types/uuid \
      .eliza.ci-disabled/packages/typescript/node_modules/@types/uuid; do
      rm -rf "$uuid_types_dir"
    done
    exit 0
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo "Published-workspace fallback dependency install failed after ${attempt} attempts" >&2
    exit 1
  fi

  echo "Published-workspace fallback dependency install failed on attempt ${attempt}; retrying in 15 seconds"
  sleep 15
done
