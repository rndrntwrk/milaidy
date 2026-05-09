export interface KubeHealthResponse {
  statusCode: number;
  payload: {
    ok: boolean;
    ready: boolean;
    agentState: "running" | "starting";
    uptime: number;
  };
}

export function buildKubeHealthResponse(
  pathname: "/health" | "/health/live" | "/health/ready",
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
