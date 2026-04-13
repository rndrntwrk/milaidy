export interface ViteHmrConfig {
  host?: string;
  port: number;
  protocol?: "ws" | "wss";
}

export interface ViteDevServerRuntime {
  origin?: string;
  hmr: ViteHmrConfig;
}

function envFlagEnabled(
  env: Record<string, string | undefined>,
  keys: string[],
): boolean {
  return keys.some((key) => {
    const normalized = env[key]?.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  });
}

function parseHttpOrigin(raw: string | undefined): URL | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resolveViteDevServerRuntime(
  env: Record<string, string | undefined>,
  uiPort: number,
): ViteDevServerRuntime {
  const explicitOrigin = parseHttpOrigin(
    env.MILADY_VITE_ORIGIN ?? env.ELIZA_VITE_ORIGIN,
  );
  const explicitHmrHost = (
    env.MILADY_HMR_HOST ??
    env.ELIZA_HMR_HOST ??
    ""
  ).trim();

  if (explicitOrigin) {
    const parsedPort = explicitOrigin.port
      ? Number.parseInt(explicitOrigin.port, 10)
      : Number.NaN;

    return {
      origin: explicitOrigin.origin,
      hmr: {
        host: explicitHmrHost || explicitOrigin.hostname,
        port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : uiPort,
        protocol: explicitOrigin.protocol === "https:" ? "wss" : "ws",
      },
    };
  }

  if (
    envFlagEnabled(env, [
      "MILADY_VITE_LOOPBACK_ORIGIN",
      "ELIZA_VITE_LOOPBACK_ORIGIN",
    ])
  ) {
    return {
      origin: `http://127.0.0.1:${uiPort}`,
      hmr: {
        host: explicitHmrHost || "127.0.0.1",
        port: uiPort,
        protocol: "ws",
      },
    };
  }

  return {
    hmr: {
      ...(explicitHmrHost ? { host: explicitHmrHost } : {}),
      port: uiPort,
    },
  };
}
