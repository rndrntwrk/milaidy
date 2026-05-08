import type {
  AccountCredentialProvider,
  OAuthCredentials,
} from "./types.js";

export interface AccountCredentialRecord {
  id: string;
  providerId: AccountCredentialProvider;
  label: string;
  source: "oauth" | "api-key";
  credentials: OAuthCredentials;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  organizationId?: string;
  userId?: string;
  email?: string;
}
