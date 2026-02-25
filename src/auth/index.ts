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

export type { CodexFlow } from "./openai-codex.js";
// OpenAI Codex (ChatGPT Plus/Pro)
export { refreshCodexToken, startCodexLogin } from "./openai-codex";

// Secure storage layer
export {
  type SecureStorageBackend,
  type EncryptedPayload,
  decrypt,
  encrypt,
  getSecureStorage,
  isEncryptedPayload,
  resetSecureStorage,
  setSecureStorageBackend,
} from "./secure-storage.js";

// Migration utilities
export {
  getProvidersPendingMigration,
  migrateCredentials,
  needsMigration,
  type MigrationResult,
} from "./migration.js";

// Key derivation
export {
  getCredentialPassphraseCandidates,
  getMachineId,
  resetMachineId,
} from "./key-derivation.js";

// Types
export type {
  OAuthCredentials,
  StoredCredentials,
  SubscriptionProvider,
} from "./types.js";
