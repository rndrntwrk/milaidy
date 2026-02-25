/**
 * Shared helpers for onboarding-required system permissions.
 */

import type {
  AllPermissionsState,
  PermissionStatus,
  SystemPermissionId,
} from "./api-client";

export const REQUIRED_ONBOARDING_PERMISSION_IDS: ReadonlyArray<SystemPermissionId> =
  ["accessibility", "screen-recording", "microphone"];

export const ONBOARDING_PERMISSION_LABELS: Readonly<Record<SystemPermissionId, string>> =
  {
    accessibility: "Accessibility",
    "screen-recording": "Screen Recording",
    microphone: "Microphone",
    camera: "Camera",
    shell: "Shell Access",
  };

export function isOnboardingPermissionGranted(
  status: PermissionStatus | undefined,
): boolean {
  return status === "granted" || status === "not-applicable";
}

export function getMissingOnboardingPermissions(
  permissions: AllPermissionsState | null | undefined,
): SystemPermissionId[] {
  if (!permissions) return [...REQUIRED_ONBOARDING_PERMISSION_IDS];
  return REQUIRED_ONBOARDING_PERMISSION_IDS.filter((id) => {
    return !isOnboardingPermissionGranted(permissions[id]?.status);
  });
}

export function hasRequiredOnboardingPermissions(
  permissions: AllPermissionsState | null | undefined,
): boolean {
  return getMissingOnboardingPermissions(permissions).length === 0;
}
