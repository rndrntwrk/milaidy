import { isValidTimeZone } from "../lifeops/defaults.js";

const TIME_ZONE_ALIASES: Record<string, string> = {
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  mst: "America/Denver",
  mdt: "America/Denver",
  mt: "America/Denver",
  mountain: "America/Denver",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  ct: "America/Chicago",
  central: "America/Chicago",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  eastern: "America/New_York",
  utc: "UTC",
  gmt: "UTC",
};

const IANA_TIME_ZONE_PATTERN =
  /\b([A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)\b/g;
const ALIAS_TIME_ZONE_PATTERN =
  /\b(pst|pdt|pt|pacific|mst|mdt|mt|mountain|cst|cdt|ct|central|est|edt|et|eastern|utc|gmt)\b/i;

export function normalizeExplicitTimeZoneToken(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const alias = TIME_ZONE_ALIASES[trimmed.toLowerCase()];
  if (alias && isValidTimeZone(alias)) {
    return alias;
  }
  if (isValidTimeZone(trimmed)) {
    return trimmed;
  }
  return null;
}

export function extractExplicitTimeZoneFromText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  let match: RegExpExecArray | null;
  for (const pattern of [new RegExp(IANA_TIME_ZONE_PATTERN), ALIAS_TIME_ZONE_PATTERN]) {
    if (pattern.global) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(value)) !== null) {
        const normalized = normalizeExplicitTimeZoneToken(match[1] ?? match[0]);
        if (normalized) {
          return normalized;
        }
      }
      continue;
    }
    match = value.match(pattern);
    const normalized = normalizeExplicitTimeZoneToken(match?.[1] ?? match?.[0]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
