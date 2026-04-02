function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasCompatApiToken(): boolean {
  return hasValue(process.env.MILADY_API_TOKEN) || hasValue(process.env.ELIZA_API_TOKEN);
}

/**
 * Platform-managed cloud containers should skip local pairing and onboarding UI.
 *
 * In production we may have either:
 * - a Steward sidecar token (older / sidecar-managed path), or
 * - an inbound API token injected directly into the container (current cloud path).
 *
 * Requiring the cloud flag plus one of those credentials keeps accidental local
 * env leakage from triggering cloud behavior, while still matching real deployed
 * cloud containers.
 */
export function isCloudProvisionedContainer(): boolean {
  const hasCloudFlag =
    process.env.MILADY_CLOUD_PROVISIONED === "1" ||
    process.env.ELIZA_CLOUD_PROVISIONED === "1";

  return (
    hasCloudFlag &&
    (hasValue(process.env.STEWARD_AGENT_TOKEN) || hasCompatApiToken())
  );
}
