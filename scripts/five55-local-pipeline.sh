#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIVE55_BASE_URL="${FIVE55_BASE_URL:-http://127.0.0.1:3100}"
MILADY_API_URL="${MILADY_API_URL:-http://127.0.0.1:31337}"
SMOKE_OUT_DIR="${FIVE55_SMOKE_OUT_DIR:-$ROOT_DIR/output/playwright}"
REQUIRE_FULL_MASTERY="${FIVE55_REQUIRE_FULL_MASTERY:-1}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[five55-pipeline] missing required command: $1" >&2
    exit 1
  fi
}

wait_http() {
  local url="$1"
  local label="$2"
  local max_attempts="${3:-40}"
  local delay_sec="${4:-1}"
  local attempt=1
  while (( attempt <= max_attempts )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[five55-pipeline] $label reachable ($url)"
      return 0
    fi
    sleep "$delay_sec"
    attempt=$((attempt + 1))
  done
  echo "[five55-pipeline] timeout waiting for $label ($url)" >&2
  return 1
}

main() {
  require_cmd curl
  require_cmd jq
  require_cmd node

  wait_http "$FIVE55_BASE_URL" "555 web"
  wait_http "$MILADY_API_URL/health/live" "milady api"

  echo "[five55-pipeline] running mastery smoke (selected by FIVE55_SMOKE_GAMES or full catalog)..."
  local smoke_require_flag=()
  if [[ "$REQUIRE_FULL_MASTERY" == "1" ]]; then
    smoke_require_flag+=(--require-mastery)
  fi

  FIVE55_SMOKE_STRICT_ERRORS=1 \
  FIVE55_SMOKE_REQUIRE_MASTERY="$REQUIRE_FULL_MASTERY" \
    node "$ROOT_DIR/scripts/five55-game-smoke.mjs" \
      --base-url "$FIVE55_BASE_URL" \
      --out-dir "$SMOKE_OUT_DIR" \
      "${smoke_require_flag[@]}"

  local mastered total failed
  mastered="$(jq -r '.mastered' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  total="$(jq -r '.total' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  failed="$(jq -r '.failed' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  echo "[five55-pipeline] mastery summary: mastered=$mastered total=$total failed=$failed require_full_mastery=$REQUIRE_FULL_MASTERY"

  echo "[five55-pipeline] PASS"
  echo "[five55-pipeline] report: $SMOKE_OUT_DIR/alice-game-smoke-report.json"
  echo "[five55-pipeline] spectate: $SMOKE_OUT_DIR/alice-game-smoke-report.html"
}

main "$@"
