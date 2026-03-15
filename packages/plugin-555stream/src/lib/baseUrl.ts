const STREAM555_BASE_ENV = 'STREAM555_BASE_URL';
const STREAM555_PUBLIC_BASE_ENV = 'STREAM555_PUBLIC_BASE_URL';
const STREAM555_INTERNAL_BASE_ENV = 'STREAM555_INTERNAL_BASE_URL';
const STREAM555_INTERNAL_AGENT_IDS_ENV = 'STREAM555_INTERNAL_AGENT_IDS';

const DEFAULT_STREAM555_PUBLIC_BASE_URL = 'https://stream.rndrntwrk.com';
const DEFAULT_STREAM555_INTERNAL_BASE_URL = 'http://control-plane:3000';
const DEFAULT_INTERNAL_AGENT_IDS = ['alice', 'alice-internal', 'alice-bot'];

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

export function isInternalAgentId(agentId: string | undefined): boolean {
  const normalized = agentId?.trim().toLowerCase();
  if (!normalized) return false;
  const configured = parseCsv(trimEnv(STREAM555_INTERNAL_AGENT_IDS_ENV));
  const allowList = configured?.length ? configured : DEFAULT_INTERNAL_AGENT_IDS;
  return allowList.includes(normalized);
}

export function resolveStream555BaseUrl(agentId: string | undefined): string {
  const publicBaseUrl = trimEnv(STREAM555_PUBLIC_BASE_ENV);
  const internalBaseUrl = trimEnv(STREAM555_INTERNAL_BASE_ENV);
  const legacyBaseUrl = trimEnv(STREAM555_BASE_ENV);
  const hasSplitBaseUrls = Boolean(publicBaseUrl || internalBaseUrl);

  if (hasSplitBaseUrls) {
    if (isInternalAgentId(agentId)) {
      return (
        internalBaseUrl ||
        legacyBaseUrl ||
        DEFAULT_STREAM555_INTERNAL_BASE_URL
      );
    }
    return publicBaseUrl || legacyBaseUrl || DEFAULT_STREAM555_PUBLIC_BASE_URL;
  }

  if (legacyBaseUrl) {
    return legacyBaseUrl;
  }

  if (isInternalAgentId(agentId)) {
    return DEFAULT_STREAM555_INTERNAL_BASE_URL;
  }

  return DEFAULT_STREAM555_PUBLIC_BASE_URL;
}
