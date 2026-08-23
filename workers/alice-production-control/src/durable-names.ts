const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;

export function authorityDurableName(): string {
  return "authority/global-safety-v1";
}

export function parseAuthorityDurableName(name: string): "authority/global-safety-v1" {
  if (name !== "authority/global-safety-v1") {
    throw new Error("AUTHORITY_DURABLE_NAME_INVALID");
  }
  return name;
}

export function sessionDurableName(
  sessionId: string,
  releaseDigest: string,
): string {
  if (!SESSION_ID_RE.test(sessionId) || !DIGEST_RE.test(releaseDigest)) {
    throw new Error("SESSION_DURABLE_NAME_INVALID");
  }
  return `session/${releaseDigest}/${sessionId}`;
}

export function parseSessionDurableName(name: string): {
  sessionId: string;
  releaseDigest: string;
} {
  const match = name.match(/^(?:session\/)(sha256:[a-f0-9]{64})\/(.+)$/);
  if (!match || !SESSION_ID_RE.test(match[2]!)) {
    throw new Error("SESSION_DURABLE_NAME_INVALID");
  }
  return { releaseDigest: match[1]!, sessionId: match[2]! };
}
