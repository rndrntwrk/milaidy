/**
 * Public entry point for the eliza package.
 *
 * Config types are the primary public API surface.
 * @module eliza
 */

export * from "@miladyai/shared/config";
export type { RestartHandler } from "@miladyai/shared/restart";
export {
  RESTART_EXIT_CODE,
  requestRestart,
  setRestartHandler,
} from "@miladyai/shared/restart";

// AppCoreRuntimeHooks surface — eliza/packages/agent/src/runtime/eliza.ts
// destructures these names from `await import("@elizaos/app-core")` at runtime.
// In our deploy layout, that dynamic import resolves to this package (the
// milaidy `packages/app-core`, mounted at node_modules/@elizaos/app-core),
// not to eliza/packages/app-core. Without these re-exports, the destructure
// yields undefined and the agent crashes in runtime-boot with
// `TypeError: runVaultBootstrap is not a function`.
export { runVaultBootstrap } from "./services/vault-bootstrap";
export { sharedVault } from "./services/vault-mirror";
export {
  applyAccountPoolApiCredentials,
  getDefaultAccountPool,
  startAccountPoolKeepAlive,
} from "./services/account-pool";
export { hydrateWalletKeysFromNodePlatformSecureStore } from "./security/hydrate-wallet-keys-from-platform-store";
