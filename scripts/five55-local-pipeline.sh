#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCADE555_BASE_URL="${ARCADE555_BASE_URL:-${FIVE55_BASE_URL:-http://127.0.0.1:3100}}"
MILADY_API_URL="${MILADY_API_URL:-http://127.0.0.1:31337}"
SMOKE_OUT_DIR="${ARCADE555_SMOKE_OUT_DIR:-${FIVE55_SMOKE_OUT_DIR:-$ROOT_DIR/output/playwright}}"
REQUIRE_FULL_MASTERY="${ARCADE555_REQUIRE_FULL_MASTERY:-${FIVE55_REQUIRE_FULL_MASTERY:-1}}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[arcade555-pipeline] missing required command: $1" >&2
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
      echo "[arcade555-pipeline] $label reachable ($url)"
      return 0
    fi
    sleep "$delay_sec"
    attempt=$((attempt + 1))
  done
  echo "[arcade555-pipeline] timeout waiting for $label ($url)" >&2
  return 1
}

main() {
  require_cmd curl
  require_cmd jq
  require_cmd node

  wait_http "$ARCADE555_BASE_URL" "555 web"
  wait_http "$MILADY_API_URL/health/live" "milady api"

  echo "[arcade555-pipeline] running mastery smoke (selected by ARCADE555_SMOKE_GAMES or legacy FIVE55_SMOKE_GAMES)..."
  local smoke_require_flag=()
  if [[ "$REQUIRE_FULL_MASTERY" == "1" ]]; then
    smoke_require_flag+=(--require-mastery)
  fi

  ARCADE555_SMOKE_STRICT_ERRORS=1 \
  ARCADE555_SMOKE_REQUIRE_MASTERY="$REQUIRE_FULL_MASTERY" \
    node "$ROOT_DIR/scripts/five55-game-smoke.mjs" \
      --base-url "$ARCADE555_BASE_URL" \
      --out-dir "$SMOKE_OUT_DIR" \
      "${smoke_require_flag[@]}"

  local mastered total failed
  mastered="$(jq -r '.mastered' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  total="$(jq -r '.total' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  failed="$(jq -r '.failed' "$SMOKE_OUT_DIR/alice-game-smoke-report.json")"
  echo "[arcade555-pipeline] mastery summary: mastered=$mastered total=$total failed=$failed require_full_mastery=$REQUIRE_FULL_MASTERY"

  echo "[arcade555-pipeline] PASS"
  echo "[arcade555-pipeline] report: $SMOKE_OUT_DIR/alice-game-smoke-report.json"
  echo "[arcade555-pipeline] spectate: $SMOKE_OUT_DIR/alice-game-smoke-report.html"
}

main "$@"
