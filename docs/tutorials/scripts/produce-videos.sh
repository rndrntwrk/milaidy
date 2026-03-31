#!/bin/bash
# Milady Tutorial Video Production Pipeline
# Uses inference.sh CLI to generate AI videos, TTS, and assemble final outputs
#
# Prerequisites:
#   1. infsh login --key YOUR_API_KEY
#   2. All captures in ../captures/*.png
#   3. video-scripts.json in same directory
#
# Usage: ./produce-videos.sh [video_id]
#   No args = produce all 11 videos
#   With arg = produce single video (e.g., ./produce-videos.sh 01-companion)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CAPTURES_DIR="${SCRIPT_DIR}/../captures"
OUTPUT_DIR="${SCRIPT_DIR}/../videos"
TEMP_DIR="${SCRIPT_DIR}/../.tmp-production"
SCRIPTS_JSON="${SCRIPT_DIR}/video-scripts.json"
INFSH="${HOME}/.local/bin/infsh"

# Models
VIDEO_MODEL="google/veo-3-1-fast"
I2V_MODEL="bytedance/seedance-1-5-pro"
TTS_MODEL="falai/dia-tts"
MERGER="infsh/media-merger"
AV_MERGER="infsh/video-audio-merger"
CAPTIONER="infsh/caption-videos"

mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"

# ─── Helpers ────────────────────────────────────────────────────────

log() { echo "[$(date +%H:%M:%S)] $*"; }

check_auth() {
  if ! $INFSH me &>/dev/null; then
    echo "ERROR: infsh not authenticated. Run:"
    echo "  infsh login --key YOUR_API_KEY"
    echo "  Get your key at: https://app.inference.sh/settings/keys"
    exit 1
  fi
  log "✓ infsh authenticated"
}

# Extract field from scripts JSON using node
get_script_field() {
  local id="$1" field="$2"
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('${SCRIPTS_JSON}', 'utf8'));
    const script = data.scripts.find(s => s.id === '${id}');
    if (!script) { process.exit(1); }
    console.log(typeof script.${field} === 'object' ? JSON.stringify(script.${field}) : script.${field});
  "
}

get_scene_count() {
  local id="$1"
  node -e "
    const data = JSON.parse(require('fs').readFileSync('${SCRIPTS_JSON}', 'utf8'));
    const script = data.scripts.find(s => s.id === '${id}');
    console.log(script.scenes.length);
  "
}

get_scene_field() {
  local id="$1" scene_idx="$2" field="$3"
  node -e "
    const data = JSON.parse(require('fs').readFileSync('${SCRIPTS_JSON}', 'utf8'));
    const script = data.scripts.find(s => s.id === '${id}');
    const scene = script.scenes[${scene_idx}];
    console.log(scene.${field});
  "
}

# ─── Step 1: Generate video scenes ──────────────────────────────────

generate_scenes() {
  local id="$1"
  local scene_count
  scene_count=$(get_scene_count "$id")
  local scene_dir="${TEMP_DIR}/${id}/scenes"
  mkdir -p "$scene_dir"

  log "Generating ${scene_count} scenes for ${id}..."

  for ((i=0; i<scene_count; i++)); do
    local prompt duration label
    prompt=$(get_scene_field "$id" "$i" "visual_prompt")
    duration=$(get_scene_field "$id" "$i" "duration_seconds")
    label=$(get_scene_field "$id" "$i" "label")

    local capture="${CAPTURES_DIR}/${id}.png"
    local out_file="${scene_dir}/scene-${i}-${label}.mp4"

    if [ -f "$out_file" ]; then
      log "  Scene ${i} (${label}) already exists, skipping"
      continue
    fi

    # For solution scenes, use image-to-video with the app capture
    if [ "$label" = "solution" ] && [ -f "$capture" ]; then
      log "  Scene ${i} (${label}): image-to-video from capture..."
      $INFSH app run "$I2V_MODEL" \
        --input-image "$capture" \
        --prompt "$prompt" \
        --duration "$duration" \
        --output "$out_file" 2>&1 || {
          log "  ⚠ I2V failed for scene ${i}, falling back to text-to-video"
          $INFSH app run "$VIDEO_MODEL" \
            --prompt "$prompt" \
            --duration "$duration" \
            --output "$out_file" 2>&1 || log "  ✗ Scene ${i} generation failed"
        }
    else
      log "  Scene ${i} (${label}): text-to-video..."
      $INFSH app run "$VIDEO_MODEL" \
        --prompt "$prompt" \
        --duration "$duration" \
        --output "$out_file" 2>&1 || log "  ✗ Scene ${i} generation failed"
    fi
  done
}

# ─── Step 2: Generate TTS voiceover ─────────────────────────────────

generate_tts() {
  local id="$1"
  local tts_dir="${TEMP_DIR}/${id}/tts"
  mkdir -p "$tts_dir"

  local voiceover
  voiceover=$(get_script_field "$id" "full_voiceover")
  local out_file="${tts_dir}/voiceover.wav"

  if [ -f "$out_file" ]; then
    log "TTS for ${id} already exists, skipping"
    return
  fi

  log "Generating TTS voiceover for ${id}..."
  $INFSH app run "$TTS_MODEL" \
    --text "$voiceover" \
    --output "$out_file" 2>&1 || log "  ✗ TTS generation failed for ${id}"
}

# ─── Step 3: Merge scenes ───────────────────────────────────────────

merge_scenes() {
  local id="$1"
  local scene_dir="${TEMP_DIR}/${id}/scenes"
  local merged="${TEMP_DIR}/${id}/merged-scenes.mp4"

  if [ -f "$merged" ]; then
    log "Merged scenes for ${id} already exist, skipping"
    return
  fi

  local scene_files
  scene_files=$(ls "${scene_dir}"/scene-*.mp4 2>/dev/null | sort | tr '\n' ',' | sed 's/,$//')

  if [ -z "$scene_files" ]; then
    log "  ⚠ No scene files for ${id}, skipping merge"
    return
  fi

  log "Merging scenes for ${id}..."
  $INFSH app run "$MERGER" \
    --inputs "$scene_files" \
    --output "$merged" 2>&1 || log "  ✗ Scene merge failed for ${id}"
}

# ─── Step 4: Merge video + audio ────────────────────────────────────

merge_audio() {
  local id="$1"
  local merged_scenes="${TEMP_DIR}/${id}/merged-scenes.mp4"
  local voiceover="${TEMP_DIR}/${id}/tts/voiceover.wav"
  local final="${TEMP_DIR}/${id}/final-no-captions.mp4"

  if [ -f "$final" ]; then
    log "AV merge for ${id} already exists, skipping"
    return
  fi

  if [ ! -f "$merged_scenes" ] || [ ! -f "$voiceover" ]; then
    log "  ⚠ Missing inputs for AV merge on ${id}"
    return
  fi

  log "Merging audio+video for ${id}..."
  $INFSH app run "$AV_MERGER" \
    --video "$merged_scenes" \
    --audio "$voiceover" \
    --output "$final" 2>&1 || log "  ✗ AV merge failed for ${id}"
}

# ─── Step 5: Add captions ───────────────────────────────────────────

add_captions() {
  local id="$1"
  local title
  title=$(get_script_field "$id" "title")
  local input="${TEMP_DIR}/${id}/final-no-captions.mp4"
  local output="${OUTPUT_DIR}/${id}.mp4"

  if [ -f "$output" ]; then
    log "Final video for ${id} already exists, skipping"
    return
  fi

  if [ ! -f "$input" ]; then
    log "  ⚠ No input for captioning ${id}"
    return
  fi

  log "Adding captions to ${id}..."
  $INFSH app run "$CAPTIONER" \
    --input "$input" \
    --output "$output" 2>&1 || {
      log "  ⚠ Captioning failed, copying uncaptioned version"
      cp "$input" "$output"
    }
}

# ─── Produce a single video ─────────────────────────────────────────

produce_video() {
  local id="$1"
  log "═══════════════════════════════════════"
  log "Producing: ${id}"
  log "═══════════════════════════════════════"

  generate_scenes "$id"
  generate_tts "$id"
  merge_scenes "$id"
  merge_audio "$id"
  add_captions "$id"

  if [ -f "${OUTPUT_DIR}/${id}.mp4" ]; then
    log "✓ Complete: ${OUTPUT_DIR}/${id}.mp4"
  else
    log "✗ Failed: ${id}"
  fi
}

# ─── Main ────────────────────────────────────────────────────────────

main() {
  check_auth

  local ids
  if [ $# -gt 0 ]; then
    ids=("$@")
  else
    ids=(
      01-companion
      02-character
      03-chat
      04-wallets
      05-knowledge
      06-connectors
      07-settings
      08-heartbeats
      09-plugins
      10-skills
      11-logs
    )
  fi

  log "Starting production for ${#ids[@]} video(s)..."

  for id in "${ids[@]}"; do
    produce_video "$id"
  done

  log ""
  log "═══════════════════════════════════════"
  log "Production complete!"
  log "Output: ${OUTPUT_DIR}/"
  ls -lh "${OUTPUT_DIR}"/*.mp4 2>/dev/null || log "No final videos yet"
  log "═══════════════════════════════════════"
}

main "$@"
