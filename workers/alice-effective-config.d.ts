export type AliceEffectiveConfigRole = "access" | "control" | "aiGateway";

export const ALICE_CLOUDFLARE_TARGET: Readonly<Record<string, string>>;
export const ALICE_AI_CHAT_MODELS: Readonly<Record<string, string>>;
export const ALICE_AI_EMBEDDING_MODELS: readonly string[];
export const ALICE_AI_GATEWAY_OPTIONS: Readonly<{
  gateway: Readonly<{
    id: string;
    skipCache: true;
    cacheTtl: 0;
    collectLog: false;
  }>;
}>;

export function canonicalAliceJson(value: unknown): string;
export function digestAliceEffectiveConfig(config: unknown): Promise<string>;
export function encodeAliceDeploymentManifest(serializedManifest: string): string;
export function buildAliceAccessEffectiveConfig(inputs: {
  accessIssuer: string;
  accessAudience: string;
  ownerEmailSha256: string;
  upstreamOrigin: string;
}): Record<string, unknown>;
export function buildAliceControlEffectiveConfig(inputs: {
  accessIssuer: string;
  accessAudience: string;
  ownerEmailSha256: string;
  modelDailyBudgetUnits: number;
  modalRevision: number;
  releaseAccessAudience: string;
  releaseServiceTokenIdSha256: string;
}): Record<string, unknown>;
export function buildAliceAiGatewayEffectiveConfig(): Record<string, unknown>;
export function verifyAliceDeploymentManifestBinding(inputs: {
  encodedManifest: string;
  expectedManifestSha256: string;
}): Promise<Record<string, unknown>>;
export function verifyAliceEffectiveConfigBinding(inputs: {
  encodedManifest: string;
  expectedManifestSha256: string;
  role: AliceEffectiveConfigRole;
  effectiveConfig: unknown;
}): Promise<Record<string, unknown>>;
