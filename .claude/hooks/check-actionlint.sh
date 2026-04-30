#!/usr/bin/env bash
# PostToolUse hook: runs actionlint on edited GitHub Actions workflows.
# Blocking-with-acknowledgment on real errors — exits with code 2 when
# actionlint reports workflow-schema issues, which in the Claude Code hook
# system requires the agent to see and acknowledge the stderr output before
# continuing. Workflow syntax errors must not ship silently, so this is
# intentional.
#
# We suppress only a short allowlist of pre-existing shellcheck style/info
# nits (SC2086, SC2129, SC2162) so unrelated workflow edits do not block on
# those specific noisy findings. Other shellcheck-backed actionlint findings
# still surface and block as real review items.
#
# Triggered on: Edit | Write | MultiEdit
# Scope filter: only runs when the touched file is a GitHub Actions workflow
# under `.github/workflows/`. Composite actions (`.github/actions/*/action.yml`)
# are explicitly skipped — actionlint parses files it's given as workflows,
# and composite actions use a different top-level schema (`runs` / `description` /
# `inputs` instead of `jobs` / `on`), so every composite action would trip a
# handful of "unexpected key" errors. If we ever need to lint composite
# actions, that needs a separate tool or a different actionlint invocation.
# Gracefully skips if actionlint is not installed.

set -u

payload="$(cat)"
file_path=""
if command -v python3 >/dev/null 2>&1; then
  file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  ti=d.get("tool_input",{}) or {}
  print(ti.get("file_path") or ti.get("path") or "")
except Exception:
  pass' 2>/dev/null || true)"
fi

case "$file_path" in
  */.github/workflows/*.yml|*/.github/workflows/*.yaml)
    ;;
  *)
    exit 0
    ;;
esac

if ! command -v actionlint >/dev/null 2>&1; then
  # actionlint not installed — soft notice once, no block
  {
    echo ""
    echo "ℹ️  actionlint not found on PATH; skipping workflow lint for $file_path"
    echo "   Install: brew install actionlint  (or see https://github.com/rhysd/actionlint)"
    echo ""
  } >&2
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
config="$repo_root/.github/actionlint.yaml"

# Suppress only a narrow set of known style-only shellcheck findings. Any
# other non-empty output is treated as a real actionlint error worth blocking.
shellcheck_ignore='shellcheck reported issue.*SC(2086|2129|2162)\b'
if [ -f "$config" ]; then
  output="$(actionlint -config-file "$config" -ignore "$shellcheck_ignore" "$file_path" 2>&1 || true)"
else
  output="$(actionlint -ignore "$shellcheck_ignore" "$file_path" 2>&1 || true)"
fi

if [ -n "$output" ]; then
  {
    echo ""
    echo "⚠️  actionlint findings in $(basename "$file_path"):"
    echo "$output" | sed 's/^/   /'
    echo ""
  } >&2
  exit 2
fi

exit 0
