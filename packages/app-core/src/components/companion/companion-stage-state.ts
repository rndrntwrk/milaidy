/**
 * Companion stage state — server-authoritative visual state for the
 * companion view.
 *
 * ## Why this exists
 *
 * Before this module, every piece of scene-level visual state in the
 * companion view lived in per-browser `localStorage` + React refs + the
 * `VrmEngine` instance. Camera zoom was stored under
 * `localStorage["milady.companion.zoom.v1"]`, camera rotation was held
 * in a component-local `dragOrbitRef`, character vrm was synced via a
 * separate `/api/stream/settings` endpoint, emotes went through yet
 * another path (`/api/emote` → `broadcastWs` → `"emote"` event).
 * Nothing unified. Nothing authoritative.
 *
 * Once the 555stream capture-service started loading the same milaidy
 * SPA at `?broadcast=1` inside a headless Chromium to render the Twitch
 * / Kick "camera frame", the per-browser approach broke in the obvious
 * way: the operator's own browser and the capture-service's browser
 * became two independent React processes with two independent
 * `localStorage` stores, so operator interactions never crossed the
 * boundary. Zooming the operator's view didn't change the stream.
 *
 * The `CompanionStageState` lives on the alice-bot server
 * (`$ELIZA_DATA_DIR/companion/stage.json` via
 * `packages/agent/src/api/misc-routes.ts`). Both the operator's browser
 * and the capture-service's headless Chromium subscribe to it through
 * the existing `/ws` channel, receive the same state updates, and
 * render them identically. Operator commands flow as REST mutations
 * (`POST /api/companion/stage`) and the server echoes the new state
 * back over WS to all subscribers. This is exactly the same shape as
 * `conversationMessages`, `agentStatus`, and the existing `"emote"`
 * event — we're just extending it to cover camera state.
 *
 * ## Phase 1 scope
 *
 * Phase 1 only covers the `camera` slice: `zoom`, `yaw`, `pitch`,
 * `pan`. Future phases will add other scene state (character vrmIndex,
 * scene preset / theme override, expressions, etc.) to the same
 * service so there's one authority, one channel, one mutation path.
 * Emotes stay on `/api/emote` for now — that pipe already works
 * end-to-end through the WS echo pattern and the migration to
 * `companion-stage-cue` is a Phase 4 cleanup, not a correctness fix.
 */

/**
 * Camera framing for the companion view.
 *
 * All values are normalized:
 * - `zoom`: 0 (widest) .. 1 (closest). `VrmEngine.setCompanionZoomNormalized`
 *   maps this to the underlying camera distance. Default 0.95 matches
 *   the legacy `DEFAULT_COMPANION_ZOOM` constant in CompanionSceneHost.
 * - `yaw` / `pitch`: radians, applied to the camera orbit target.
 *   Default 0 — the VRM model centered straight-on.
 * - `pan`: horizontal camera offset used by the character editor; 0
 *   means no offset. Most scenes leave this untouched.
 */
export interface CompanionStageCamera {
  zoom: number;
  yaw: number;
  pitch: number;
  pan: number;
}

export interface CompanionStageState {
  camera: CompanionStageCamera;
}

/**
 * Partial mutation shape — clients send this to the server; the server
 * deep-merges it into the persistent state. Missing fields are left
 * unchanged.
 */
export interface PartialCompanionStageState {
  camera?: Partial<CompanionStageCamera>;
}

/**
 * Defaults applied both server-side (when `stage.json` is missing) and
 * client-side (before hydration completes). The zoom default matches
 * the legacy `DEFAULT_COMPANION_ZOOM = 0.95` constant so existing
 * captures don't visually jump on the first deploy.
 */
export const DEFAULT_COMPANION_STAGE_STATE: CompanionStageState = {
  camera: {
    zoom: 0.95,
    yaw: 0,
    pitch: 0,
    pan: 0,
  },
};

/**
 * Deep-merge a partial patch into a full state, producing a new full
 * state. Used both on the server (to persist the merged result) and on
 * the client (for optimistic local updates before the echo arrives).
 *
 * Intentionally shallow — we only have one nested slice (`camera`) so
 * a recursive merge would be overkill. When Phase 2+ adds more slices,
 * extend this by spreading each slice individually.
 */
export function mergeCompanionStageState(
  base: CompanionStageState,
  patch: PartialCompanionStageState,
): CompanionStageState {
  return {
    camera: {
      ...base.camera,
      ...(patch.camera ?? {}),
    },
  };
}

/**
 * Clamp helpers kept alongside the state module so client and server
 * agree on the bounds. A rejected clamp just silently snaps into
 * range — we trust both sides to behave, but defend against clients
 * sending `Infinity` or `NaN`.
 */
export function clampCompanionStageCamera(
  camera: CompanionStageCamera,
): CompanionStageCamera {
  return {
    zoom: clamp01(camera.zoom, DEFAULT_COMPANION_STAGE_STATE.camera.zoom),
    yaw: clampFinite(camera.yaw, 0, -Math.PI, Math.PI),
    pitch: clampFinite(camera.pitch, 0, -Math.PI / 2, Math.PI / 2),
    pan: clampFinite(camera.pan, 0, -5, 5),
  };
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampFinite(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
