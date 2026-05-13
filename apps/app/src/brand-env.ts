/**
 * Milady ↔ Eliza environment variable aliasing.
 *
 * This is Milady-specific and lives in apps/app, NOT in packages/app-core.
 * The alias table is passed to the boot config so that app-core's generic
 * syncBrandEnvToEliza/syncElizaEnvToBrand functions can use it.
 */

export const MILADY_ENV_ALIASES = [
  // API & auth
  ["MILADY_API_TOKEN", "ELIZA_API_TOKEN"],
  ["MILADY_API_BIND", "ELIZA_API_BIND"],
  ["MILADY_PAIRING_DISABLED", "ELIZA_PAIRING_DISABLED"],
  ["MILADY_ALLOWED_ORIGINS", "ELIZA_ALLOWED_ORIGINS"],
  ["MILADY_ALLOW_NULL_ORIGIN", "ELIZA_ALLOW_NULL_ORIGIN"],
  ["MILADY_ALLOW_WS_QUERY_TOKEN", "ELIZA_ALLOW_WS_QUERY_TOKEN"],
  ["MILADY_WALLET_EXPORT_TOKEN", "ELIZA_WALLET_EXPORT_TOKEN"],
  ["MILADY_TERMINAL_RUN_TOKEN", "ELIZA_TERMINAL_RUN_TOKEN"],
  ["MILADY_NAMESPACE", "ELIZA_NAMESPACE"],
  ["MILADY_STATE_DIR", "ELIZA_STATE_DIR"],
  ["MILADY_CONFIG_PATH", "ELIZA_CONFIG_PATH"],
  // Cloud services
  ["MILADY_CLOUD_TTS_DISABLED", "ELIZA_CLOUD_TTS_DISABLED"],
  ["MILADY_CLOUD_MEDIA_DISABLED", "ELIZA_CLOUD_MEDIA_DISABLED"],
  ["MILADY_CLOUD_EMBEDDINGS_DISABLED", "ELIZA_CLOUD_EMBEDDINGS_DISABLED"],
  ["MILADY_CLOUD_RPC_DISABLED", "ELIZA_CLOUD_RPC_DISABLED"],
  ["MILADY_DISABLE_LOCAL_EMBEDDINGS", "ELIZA_DISABLE_LOCAL_EMBEDDINGS"],
  ["MILADY_DISABLE_EDGE_TTS", "ELIZA_DISABLE_EDGE_TTS"],
  // Ports
  ["MILADY_PORT", "ELIZA_PORT"],
  ["MILADY_API_PORT", "ELIZA_API_PORT"],
  ["MILADY_HOME_PORT", "ELIZA_HOME_PORT"],
  ["MILADY_GATEWAY_PORT", "ELIZA_GATEWAY_PORT"],
  ["MILADY_BRIDGE_PORT", "ELIZA_BRIDGE_PORT"],
] as const;

/**
 * Upstream-compatible aliases for the generic boot config surface.
 *
 * After PR #150 brought the upstream baseline of main.tsx into alice,
 * main.tsx imports `APP_ENV_PREFIX` and `APP_ENV_ALIASES` from this
 * module — but the file still only exported the legacy `MILADY_ENV_ALIASES`
 * name, so Rollup failed the static bind in the SPA build (deploy #38).
 *
 * Re-export the same shape under the upstream-canonical names. The prefix
 * is the bare brand token; main.tsx uses it as a template literal for
 * injection variable names (`__${APP_ENV_PREFIX}_API_BASE__`).
 *
 * Kept additive (rather than replacing `MILADY_ENV_ALIASES`) so the
 * existing `brand-env.test.ts` still asserts against the legacy name.
 */
export const APP_ENV_PREFIX = "MILADY";
export const APP_ENV_ALIASES = MILADY_ENV_ALIASES;
