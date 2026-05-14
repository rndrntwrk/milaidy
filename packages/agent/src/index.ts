export * from "./api/index.js";
export * from "./auth/index.js";
export * from "./config/index.js";
export * from "./diagnostics/integration-observability.js";
export * from "./hooks/index.js";
export * from "./providers/workspace.js";
export * from "./runtime/index.js";
export * from "./runtime/core-plugins.js";
export * from "./security/audit-log.js";
export * from "./security/network-policy.js";
export * from "./server/index.js";
export * from "./services/index.js";
export * from "./triggers/action.js";
export * from "./triggers/runtime.js";
export * from "./triggers/scheduling.js";
export * from "./triggers/types.js";
export * from "./utils/number-parsing.js";
export * from "./utils/spoken-text.js";

// ── Surface the remaining @elizaos/agent top-level API the runtime needs ──
//
// The compiled milaidy runtime entry (`dist/entry.js`, bundled by tsdown
// from eliza/packages/app-core/src/entry.ts against upstream eliza's
// `@elizaos/agent`) imports ~70 names from "@elizaos/agent". At runtime
// the deploy materializes `@elizaos/agent` from THIS package, so this
// package's index must surface the same names. The 18 barrels above only
// cover part of that surface; the modules below close the gap.
//
// `api/plugin-runtime-apply` → applyPluginRuntimeMutation
// `runtime/operations/vault-bridge` → isVaultRef, parseVaultRef
// `runtime/plugin-resolver` → getLastFailedPluginNames
// `version-resolver` → resolveElizaVersion
// `runtime/advanced-capabilities-config` is a new file copied verbatim from
//   upstream eliza (alice's packages/agent predated the advanced-capabilities
//   feature). The bare `export *` mirrors upstream's own index.ts:158, which
//   surfaces the whole module: ADVANCED_CAPABILITY_PLUGIN_IDS,
//   AdvancedCapabilityPluginId, isAdvancedCapabilityPluginId,
//   resolveAdvancedCapabilitiesEnabled, applyAdvancedCapabilitiesConfig,
//   applyAdvancedCapabilitySettings. The runtime entry needs the two
//   is*/resolve* names; the rest come along to keep alice's surface a
//   faithful superset of upstream's, exactly as upstream ships it.
export * from "./api/plugin-runtime-apply.js";
export * from "./runtime/operations/vault-bridge.js";
export * from "./runtime/plugin-resolver.js";
export * from "./version-resolver.js";
export * from "./runtime/advanced-capabilities-config.js";

// `services/plugin-manager-types` is re-exported by name (not `export *`)
// because it defines its own `RegistryPluginInfo` / `RegistrySearchResult`
// interfaces (extending the registry-client base types) which collide with
// the same names already surfaced through `./services/index.js`.
// `isPluginManagerLike` is the only name the runtime needs from it.
export { isPluginManagerLike } from "./services/plugin-manager-types.js";

// `resolveAppHeroImage` — its function body is copied verbatim from upstream
// eliza into services/registry-client-queries.ts (alice's copy of that file
// predated the function). It calls `packageNameToAppRouteSlug`, which alice's
// copy already imports from "../contracts/apps.js"; upstream imports the same
// helper from "@elizaos/shared" — that local re-export path is a pre-existing
// intentional fork in alice's file, unchanged by this PR. Exported by name
// rather than wildcard — registry-client-queries.ts also exports
// toAppInfo / toAppEntry / toPluginListItem etc. which are surfaced
// elsewhere and would collide under a bare `export *`.
export { resolveAppHeroImage } from "./services/registry-client-queries.js";

// `api/server` is re-exported explicitly (not `export *`) because it and
// `api/plugin-discovery-helpers` (already surfaced via `./api/index.js`)
// each independently define `SkillEntry`, `LogEntry`, `StreamEventType`,
// and `StreamEventEnvelope` — a bare wildcard would make those four
// ambiguous (TS2308). The value/function names below are unique to
// server.ts (or re-exported by it from a single canonical source), so
// listing them explicitly surfaces the runtime API without the type clash.
export {
  cloneWithoutBlockedObjectKeys,
  ensureApiTokenForBindHost,
  extractAuthToken,
  fetchWithTimeoutGuard,
  injectApiBaseIntoHtml,
  isAllowedHost,
  isAuthorized,
  isSafeResetStateDir,
  normalizeWsClientId,
  persistConversationRoomTitle,
  resolveCorsOrigin,
  resolveMcpServersRejection,
  resolveMcpTerminalAuthorizationRejection,
  resolvePluginConfigMutationRejections,
  resolveTerminalRunClientId,
  resolveTerminalRunRejection,
  resolveWalletExportRejection,
  resolveWebSocketUpgradeRejection,
  routeAutonomyTextToUser,
  startApiServer,
  streamResponseBodyWithByteLimit,
  validateMcpServerConfig,
} from "./api/server.js";
