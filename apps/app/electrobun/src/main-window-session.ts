function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const PACKAGED_BOOTSTRAP_PARTITION = "persist:bootstrap-isolated";
const WINDOWS_BOOTSTRAP_PARTITION = "bootstrap-isolated";

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

  if (trimToNull(env.MILADY_DESKTOP_TEST_API_BASE)) {
    if (platform === "win32") {
      // Hosted Windows runners fail when CEF tries to materialize either the
      // persistent default session or a persistent test partition on disk.
      // Force a non-persistent partition for the bootstrap harness so the
      // renderer can start without touching the redirected profile roots.
      return WINDOWS_BOOTSTRAP_PARTITION;
    }

    return PACKAGED_BOOTSTRAP_PARTITION;
  }

  return null;
}
