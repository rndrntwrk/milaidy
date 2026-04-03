function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const PACKAGED_BOOTSTRAP_PARTITION = "persist:bootstrap-isolated";

function normalizePartition(partition: string): string {
  return partition.includes(":") ? partition : `persist:${partition}`;
}

export function resolveMainWindowPartition(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const explicitPartition = trimToNull(env.MILADY_DESKTOP_TEST_PARTITION);
  if (explicitPartition) {
    return normalizePartition(explicitPartition);
  }

  // Packaged Windows bootstrap already runs with redirected APPDATA and
  // LOCALAPPDATA roots. Reusing the default session inside that isolated
  // profile is more reliable than forcing an extra CEF partition, which has
  // been observed to stall renderer bootstrap on hosted runners.
  if (platform !== "win32" && trimToNull(env.MILADY_DESKTOP_TEST_API_BASE)) {
    return PACKAGED_BOOTSTRAP_PARTITION;
  }

  return null;
}
