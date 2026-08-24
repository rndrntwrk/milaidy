export interface KubeHealthResponse {
  statusCode: number;
  payload: {
    ok: boolean;
    ready: boolean;
    agentState: "running" | "starting";
    uptime: number;
  };
}

export type KubeHealthPathname = "/health" | "/health/live" | "/health/ready";

export function shouldServeCompatKubeHealthRoute(
  method: string | undefined,
  pathname: string,
  aliceProduction: boolean,
): pathname is KubeHealthPathname {
  if (method !== "GET") return false;
  if (pathname === "/health/live") return true;
  if (aliceProduction) return false;
  return pathname === "/health" || pathname === "/health/ready";
}

export function buildKubeHealthResponse(
  pathname: KubeHealthPathname,
  hasRuntime: boolean,
  uptimeSeconds: number,
): KubeHealthResponse {
  const isLiveRoute = pathname === "/health/live";
  const statusCode = isLiveRoute || hasRuntime ? 200 : 503;

  return {
    statusCode,
    payload: {
      ok: isLiveRoute ? true : hasRuntime,
      ready: hasRuntime,
      agentState: hasRuntime ? "running" : "starting",
      uptime: uptimeSeconds,
    },
  };
}
