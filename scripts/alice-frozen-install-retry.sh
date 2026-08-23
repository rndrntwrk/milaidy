#!/usr/bin/env bash
set -euo pipefail

bun_bin="${ALICE_BUN_BIN:-bun}"
retry_delay_seconds="${ALICE_FROZEN_INSTALL_RETRY_DELAY_SECONDS:-5}"
case "$retry_delay_seconds" in
  ''|*[!0-9]*)
    echo "ALICE_FROZEN_INSTALL_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
    exit 64
    ;;
esac

install_log="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/alice-frozen-install.XXXXXX")"
trap 'rm -f -- "$install_log"' EXIT

for attempt in 1 2 3; do
  set +e
  "$bun_bin" install --ignore-scripts --frozen-lockfile 2>&1 | tee "$install_log"
  install_status="${PIPESTATUS[0]}"
  set -e

  if [ "$install_status" -eq 0 ]; then
    exit 0
  fi

  if ! grep -Eiq \
    'error: GET https://[^ ]+ - (408|425|429|5[0-9][0-9])|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|socket hang up|TLS handshake timeout|temporary failure' \
    "$install_log"; then
    echo "Frozen dependency install failed with a non-transient error; refusing retry" >&2
    exit "$install_status"
  fi

  if [ "$attempt" -eq 3 ]; then
    echo "Frozen dependency install exhausted three transient-failure attempts" >&2
    exit "$install_status"
  fi

  echo "Transient dependency fetch failure; retrying frozen install (attempt $((attempt + 1))/3)" >&2
  if [ "$retry_delay_seconds" -gt 0 ]; then
    sleep "$((retry_delay_seconds * attempt))"
  fi
done

exit 70
