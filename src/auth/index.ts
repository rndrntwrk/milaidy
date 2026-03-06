/**
 * Auth module — subscription-based OAuth for Claude Max and Codex Pro.
 *
 * Uses @mariozechner/pi-ai for OAuth flows (PKCE, token exchange, refresh).
 * Credentials are stored securely using system keychain or AES-256-GCM encryption.
 *
 * @module auth
 */

export type { AnthropicFlow } from "./anthropic";
// Anthropic (Claude Pro/Max)
export { refreshAnthropicToken, startAnthropicLogin } from "./anthropic";

// Credential storage + management
export {
  applySubscriptionCredentials,
  deleteCredentials,
  getAccessToken,
  getSubscriptionStatus,
  hasValidCredentials,
  loadCredentials,
  saveCredentials,
  startSubscriptionCredentialRefreshLoop,
  stopSubscriptionCredentialRefreshLoop,
  validateOpenAiCodexAccess,
} from "./credentials.js";
// Key derivation
export {
  getCredentialPassphraseCandidates,
  getMachineId,
  resetMachineId,
} from "./key-derivation.js";
// Migration utilities
export {
  getProvidersPendingMigration,
  type MigrationResult,
  migrateCredentials,
  needsMigration,
} from "./migration.js";
// OpenAI Codex (ChatGPT Plus/Pro)
export { refreshCodexToken, startCodexLogin } from "./openai-codex";
export type { CodexFlow } from "./openai-codex.js";
// Secure storage layer
export {
  decrypt,
  type EncryptedPayload,
  encrypt,
  getSecureStorage,
  isEncryptedPayload,
  resetSecureStorage,
  type SecureStorageBackend,
  setSecureStorageBackend,
} from "./secure-storage.js";

// Types
export type {
  OAuthCredentials,
  StoredCredentials,
  SubscriptionProvider,
} from "./types.js";
