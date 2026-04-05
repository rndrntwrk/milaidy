import type {
  LifeOpsConnectorExecutionTarget,
  LifeOpsConnectorGrant,
  LifeOpsConnectorMode,
  LifeOpsConnectorSourceOfTruth,
} from "@miladyai/shared/contracts/lifeops";
import {
  resolveConfiguredGoogleModes,
  resolveGoogleDefaultMode,
} from "./google-oauth.js";

export interface GoogleModeAvailability {
  defaultMode: LifeOpsConnectorMode;
  availableModes: LifeOpsConnectorMode[];
}

function uniqueModes(
  modes: readonly LifeOpsConnectorMode[],
): LifeOpsConnectorMode[] {
  return [...new Set(modes)];
}

export function resolveGoogleExecutionTarget(
  grantOrMode:
    | Pick<LifeOpsConnectorGrant, "executionTarget" | "mode">
    | LifeOpsConnectorMode,
): LifeOpsConnectorExecutionTarget {
  if (typeof grantOrMode === "string") {
    return grantOrMode === "cloud_managed" ? "cloud" : "local";
  }
  if (
    grantOrMode.executionTarget === "cloud" ||
    grantOrMode.mode === "cloud_managed"
  ) {
    return "cloud";
  }
  return "local";
}

export function resolveGoogleSourceOfTruth(
  grantOrMode:
    | Pick<LifeOpsConnectorGrant, "sourceOfTruth" | "mode">
    | LifeOpsConnectorMode,
): LifeOpsConnectorSourceOfTruth {
  if (typeof grantOrMode === "string") {
    return grantOrMode === "cloud_managed"
      ? "cloud_connection"
      : "local_storage";
  }
  if (
    grantOrMode.sourceOfTruth === "cloud_connection" ||
    grantOrMode.mode === "cloud_managed"
  ) {
    return "cloud_connection";
  }
  return "local_storage";
}

export function resolveGoogleAvailableModes(args: {
  requestUrl: URL;
  cloudConfigured: boolean;
  grants?: readonly LifeOpsConnectorGrant[];
}): GoogleModeAvailability {
  const localModes = resolveConfiguredGoogleModes();
  const grantedModes = (args.grants ?? [])
    .filter((grant) => grant.provider === "google")
    .map((grant) => grant.mode);
  const availableModes = uniqueModes([
    ...localModes,
    ...(args.cloudConfigured ? ["cloud_managed"] : []),
    ...grantedModes,
  ]);

  const defaultMode = args.cloudConfigured
    ? "cloud_managed"
    : (availableModes[0] ?? resolveGoogleDefaultMode(args.requestUrl));

  return {
    defaultMode,
    availableModes,
  };
}

export function resolvePreferredGoogleGrant(args: {
  grants: readonly LifeOpsConnectorGrant[];
  requestedMode?: LifeOpsConnectorMode;
  defaultMode: LifeOpsConnectorMode;
}): LifeOpsConnectorGrant | null {
  const googleGrants = args.grants.filter(
    (grant) => grant.provider === "google",
  );
  if (googleGrants.length === 0) {
    return null;
  }

  if (args.requestedMode) {
    return (
      googleGrants.find((grant) => grant.mode === args.requestedMode) ?? null
    );
  }

  const preferredGrant =
    googleGrants.find((grant) => grant.preferredByAgent) ?? null;
  if (preferredGrant) {
    return preferredGrant;
  }

  const defaultGrant =
    googleGrants.find((grant) => grant.mode === args.defaultMode) ?? null;
  if (defaultGrant) {
    return defaultGrant;
  }

  return (
    [...googleGrants].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0] ?? null
  );
}
