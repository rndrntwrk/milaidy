/** Platform utilities — onboarding permissions and platform initialization helpers. */

import type {
  AllPermissionsState,
  PermissionStatus,
  SystemPermissionId,
} from "../api/client";

// ── Onboarding permissions ──────────────────────────────────────────────

export const REQUIRED_ONBOARDING_PERMISSION_IDS: ReadonlyArray<SystemPermissionId> =
  ["accessibility", "screen-recording", "microphone"];

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

// ── Platform init ───────────────────────────────────────────────────────

export { applyLaunchConnectionFromUrl } from "./browser-launch";
export * from "./cloud-preference-patch";
export * from "./desktop-permissions-client";
export {
  type BroadcastMode,
  type DeepLinkHandlers,
  dispatchShareTarget,
  getBroadcastChannel,
  getBroadcastMode,
  handleDeepLink,
  injectBroadcastApiBase,
  injectPopoutApiBase,
  isAndroid,
  isBroadcastWindow,
  isDesktopPlatform,
  isIOS,
  isNative,
  isPopoutWindow,
  isUnknownBroadcastRoute,
  isWebPlatform,
  platform,
  type ShareTargetFile,
  type ShareTargetPayload,
  setupPlatformStyles,
} from "./init";
export * from "./lifeops-github";
export * from "./onboarding-reset";
export * from "./window-shell";
