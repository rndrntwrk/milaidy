import {
  LIFEOPS_GOOGLE_CAPABILITIES,
  type LifeOpsGoogleCapability,
} from "@miladyai/shared/contracts/lifeops";

export const GOOGLE_OPENID_SCOPES = ["openid", "email", "profile"] as const;
export const GOOGLE_CALENDAR_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_CALENDAR_WRITE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_GMAIL_TRIAGE_SCOPE =
  "https://www.googleapis.com/auth/gmail.metadata";
export const GOOGLE_GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

const GOOGLE_CAPABILITY_SCOPE_MAP: Record<LifeOpsGoogleCapability, string[]> = {
  "google.basic_identity": [...GOOGLE_OPENID_SCOPES],
  "google.calendar.read": [GOOGLE_CALENDAR_READ_SCOPE],
  "google.calendar.write": [GOOGLE_CALENDAR_WRITE_SCOPE],
  "google.gmail.triage": [GOOGLE_GMAIL_TRIAGE_SCOPE],
  "google.gmail.send": [GOOGLE_GMAIL_SEND_SCOPE],
};

export const DEFAULT_GOOGLE_CONNECTOR_CAPABILITIES: LifeOpsGoogleCapability[] = [
  "google.basic_identity",
  "google.calendar.read",
];

export function normalizeGoogleCapabilities(
  value: Iterable<unknown> | undefined,
  defaultCapabilities: readonly LifeOpsGoogleCapability[] =
    DEFAULT_GOOGLE_CONNECTOR_CAPABILITIES,
): LifeOpsGoogleCapability[] {
  const allowed = new Set<LifeOpsGoogleCapability>(LIFEOPS_GOOGLE_CAPABILITIES);
  const normalized: LifeOpsGoogleCapability[] = [];
  const seen = new Set<LifeOpsGoogleCapability>();
  const source = value ? Array.from(value) : [...defaultCapabilities];

  for (const candidate of source) {
    if (typeof candidate !== "string") {
      continue;
    }
    if (!allowed.has(candidate as LifeOpsGoogleCapability)) {
      continue;
    }
    const capability = candidate as LifeOpsGoogleCapability;
    if (seen.has(capability)) {
      continue;
    }
    seen.add(capability);
    normalized.push(capability);
  }

  if (!seen.has("google.basic_identity")) {
    normalized.unshift("google.basic_identity");
  }

  return normalized;
}

export function unionGoogleCapabilities(
  ...capabilityLists: Array<readonly LifeOpsGoogleCapability[] | undefined>
): LifeOpsGoogleCapability[] {
  const merged: LifeOpsGoogleCapability[] = [];
  const seen = new Set<LifeOpsGoogleCapability>();
  for (const list of capabilityLists) {
    if (!list) {
      continue;
    }
    for (const capability of normalizeGoogleCapabilities(list)) {
      if (seen.has(capability)) continue;
      seen.add(capability);
      merged.push(capability);
    }
  }
  return merged.length > 0
    ? merged
    : [...DEFAULT_GOOGLE_CONNECTOR_CAPABILITIES];
}

export function googleCapabilitiesToScopes(
  capabilities: readonly LifeOpsGoogleCapability[],
): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const capability of normalizeGoogleCapabilities(capabilities)) {
    for (const scope of GOOGLE_CAPABILITY_SCOPE_MAP[capability]) {
      if (seen.has(scope)) continue;
      seen.add(scope);
      scopes.push(scope);
    }
  }
  return scopes;
}

export function googleScopesToCapabilities(
  scopes: readonly string[],
): LifeOpsGoogleCapability[] {
  const granted = new Set(scopes.map((scope) => scope.trim()).filter(Boolean));
  const capabilities: LifeOpsGoogleCapability[] = [];
  for (const capability of LIFEOPS_GOOGLE_CAPABILITIES) {
    const requiredScopes = GOOGLE_CAPABILITY_SCOPE_MAP[capability];
    if (requiredScopes.every((scope) => granted.has(scope))) {
      capabilities.push(capability);
    }
  }
  return capabilities;
}
