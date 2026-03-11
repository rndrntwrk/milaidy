#!/usr/bin/env bash
# electrobun-dev: Pre-write/edit validator
# Non-blocking — emits warnings to stderr, always exits 0

# Read tool input JSON from stdin
INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // (.tool_input.new_string // empty)' 2>/dev/null)

# Resolve relative paths to absolute so the walk-up loop terminates correctly
FILE_PATH=$(realpath "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")

# Only check TypeScript/JavaScript source files
if [[ -z "$CONTENT" ]] || [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

WARNINGS=()

# ── 1. WebGPU code without bundleWGPU ──────────────────────────────────────
if echo "$CONTENT" | grep -qiE "(GpuWindow|WGPUView|wgpu)"; then
  if [[ "$FILE_PATH" != *"electrobun.config"* ]]; then
    # Walk up from file to find electrobun.config.ts
    DIR=$(dirname "$FILE_PATH")
    CONFIG_FILE=""
    while [[ "$DIR" != "/" && "$DIR" != "." ]]; do
      if [[ -f "$DIR/electrobun.config.ts" ]]; then
        CONFIG_FILE="$DIR/electrobun.config.ts"
        break
      fi
      DIR=$(dirname "$DIR")
    done

    if [[ -n "$CONFIG_FILE" ]]; then
      if ! grep -q "bundleWGPU.*true" "$CONFIG_FILE" 2>/dev/null; then
        WARNINGS+=("⚠️  WebGPU code detected but bundleWGPU: true is missing in electrobun.config.ts — the app will fail to load the WGPU native library at runtime")
      fi
    else
      WARNINGS+=("⚠️  WebGPU code detected — ensure bundleWGPU: true is set in electrobun.config.ts for each target platform")
    fi
  fi
fi

# ── 2. CEF renderer without bundleCEF in config ────────────────────────────
if echo "$CONTENT" | grep -qE "renderer[[:space:]]*:[[:space:]]*['\"]cef['\"]"; then
  DIR=$(dirname "$FILE_PATH")
  CEF_CONFIG=""
  while [[ "$DIR" != "/" && "$DIR" != "." ]]; do
    if [[ -f "$DIR/electrobun.config.ts" ]]; then
      CEF_CONFIG="$DIR/electrobun.config.ts"
      break
    fi
    DIR=$(dirname "$DIR")
  done
  if [[ -n "$CEF_CONFIG" ]]; then
    if ! grep -q "bundleCEF.*true" "$CEF_CONFIG" 2>/dev/null; then
      WARNINGS+=("⚠️  CEF renderer detected but bundleCEF: true is missing in electrobun.config.ts — app will fail to load Chromium at runtime (adds ~120MB to bundle size)")
    fi
  else
    WARNINGS+=("⚠️  CEF renderer detected — ensure bundleCEF: true is set in electrobun.config.ts for each target platform (adds ~120MB to bundle size)")
  fi
fi

# ── 3. defineRPC without maxRequestTime ────────────────────────────────────
if echo "$CONTENT" | grep -qE "(defineRPC|defineElectrobunRPC)[[:space:]]*\("; then
  if ! echo "$CONTENT" | grep -q "maxRequestTime"; then
    WARNINGS+=("⚠️  RPC definition missing maxRequestTime — long operations (file dialogs, DB writes) will hit the default timeout. Set maxRequestTime: 10000 or higher for non-trivial handlers")
  fi
fi

# ── 4. FFI pointers in GPU code without KEEPALIVE ──────────────────────────
if echo "$CONTENT" | grep -qE "(new GpuWindow|await.*requestAdapter|await.*requestDevice|\.createRenderPipeline|\.createBuffer)"; then
  if ! echo "$CONTENT" | grep -q "KEEPALIVE"; then
    WARNINGS+=("⚠️  WebGPU objects without KEEPALIVE array — Bun's GC will collect FFI pointers mid-render causing segfaults. Add: const KEEPALIVE: unknown[] = [] and push every GPU object into it")
  fi
fi

# ── Emit warnings ───────────────────────────────────────────────────────────
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo "" >&2
  echo "┌─ electrobun-dev ─────────────────────────────────────────────" >&2
  for W in "${WARNINGS[@]}"; do
    echo "│ $W" >&2
  done
  echo "└───────────────────────────────────────────────────────────────" >&2
  echo "" >&2
fi

exit 0
