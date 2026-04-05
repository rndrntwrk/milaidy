import type {
  LifeOpsConnectorMode,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../api";
import { openExternalUrl } from "../utils";

const DEFAULT_GOOGLE_CONNECTOR_POLL_INTERVAL_MS = 15_000;
const DEFAULT_VISIBLE_GOOGLE_MODES: readonly LifeOpsConnectorMode[] = [
  "cloud_managed",
  "local",
] as const;

function formatConnectorError(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message.trim();
  }
  return fallback;
}

function uniqueModes(
  modes: Iterable<LifeOpsConnectorMode | null | undefined>,
): LifeOpsConnectorMode[] {
  const ordered: LifeOpsConnectorMode[] = [];
  const seen = new Set<LifeOpsConnectorMode>();
  for (const mode of modes) {
    if (!mode || seen.has(mode)) {
      continue;
    }
    seen.add(mode);
    ordered.push(mode);
  }
  return ordered;
}

function resolveVisibleModes(
  status: LifeOpsGoogleConnectorStatus | null,
): LifeOpsConnectorMode[] {
  return uniqueModes([
    status?.mode,
    status?.defaultMode,
    ...(status?.availableModes ?? []),
    ...DEFAULT_VISIBLE_GOOGLE_MODES,
  ]);
}

export interface UseGoogleLifeOpsConnectorOptions {
  pollIntervalMs?: number;
}

export function useGoogleLifeOpsConnector(
  options: UseGoogleLifeOpsConnectorOptions = {},
) {
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_GOOGLE_CONNECTOR_POLL_INTERVAL_MS;
  const selectedModeRef = useRef<LifeOpsConnectorMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<LifeOpsConnectorMode | null>(
    null,
  );
  const [status, setStatus] = useState<LifeOpsGoogleConnectorStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async ({
      silent = false,
      mode,
    }: {
      silent?: boolean;
      mode?: LifeOpsConnectorMode | null;
    } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const requestedMode =
          mode === undefined ? selectedModeRef.current : mode;
        const nextStatus = await client.getGoogleLifeOpsConnectorStatus(
          requestedMode ?? undefined,
        );
        const nextSelectedMode = requestedMode ?? nextStatus.mode;
        selectedModeRef.current = nextSelectedMode;
        setSelectedMode(nextSelectedMode);
        setStatus(nextStatus);
        setError(null);
      } catch (cause) {
        setError(
          formatConnectorError(
            cause,
            "Google connector status failed to refresh.",
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void refresh();
    const intervalId = window.setInterval(() => {
      if (!active) {
        return;
      }
      void refresh({ silent: true });
    }, pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refresh]);

  const selectMode = useCallback(
    async (mode: LifeOpsConnectorMode) => {
      try {
        setActionPending(true);
        const nextStatus = (status?.availableModes ?? []).includes(mode)
          ? await client.selectGoogleLifeOpsConnectorMode({ mode })
          : await client.getGoogleLifeOpsConnectorStatus(mode);
        selectedModeRef.current = mode;
        setSelectedMode(mode);
        setStatus(nextStatus);
        setError(null);
      } catch (cause) {
        setError(
          formatConnectorError(cause, "Google connector mode change failed."),
        );
      } finally {
        setActionPending(false);
      }
    },
    [status],
  );

  const connect = useCallback(async () => {
    try {
      setActionPending(true);
      const result = await client.startGoogleLifeOpsConnector({
        mode: selectedModeRef.current ?? status?.mode ?? status?.defaultMode,
      });
      await openExternalUrl(result.authUrl);
      setError(null);
    } catch (cause) {
      setError(
        formatConnectorError(cause, "Google connector setup failed to start."),
      );
    } finally {
      setActionPending(false);
    }
  }, [status?.defaultMode, status?.mode]);

  const disconnect = useCallback(async () => {
    if (!status) {
      return;
    }
    try {
      setActionPending(true);
      await client.disconnectGoogleLifeOpsConnector({
        mode: selectedModeRef.current ?? status.mode,
      });
      selectedModeRef.current = null;
      await refresh({ mode: null });
    } catch (cause) {
      setError(
        formatConnectorError(cause, "Google connector disconnect failed."),
      );
    } finally {
      setActionPending(false);
    }
  }, [refresh, status]);

  const modeOptions = useMemo(() => resolveVisibleModes(status), [status]);
  const activeMode =
    selectedMode ?? status?.mode ?? status?.defaultMode ?? "cloud_managed";

  return {
    activeMode,
    actionPending,
    connect,
    disconnect,
    error,
    loading,
    modeOptions,
    refresh,
    selectMode,
    selectedMode,
    status,
  } as const;
}
