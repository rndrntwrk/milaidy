import {
  createAgentRequestId,
  requestAgentJson,
  type AgentJsonResponse,
} from "../five55-shared/agent-auth.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function extractGamesUpstreamError(
  payload: unknown,
  rawBody: string,
): string {
  const record = asRecord(payload);
  const nestedError = asRecord(record?.error);
  const messageCandidates = [
    record?.message,
    record?.error,
    nestedError?.message,
    rawBody.trim(),
  ];
  for (const candidate of messageCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "Upstream games request failed";
}

export async function requestGamesAgentJson(
  upstreamBase: string,
  requestId: string,
  method: "GET" | "POST",
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<AgentJsonResponse> {
  return requestAgentJson({
    method,
    baseUrl: upstreamBase,
    endpoint,
    ...(body !== undefined ? { body } : {}),
    requestId,
    logScope: "api-five55-games",
  });
}

export async function ensureGamesAgentSessionId(
  upstreamBase: string,
  preferredSessionId?: string,
  requestId?: string,
): Promise<string> {
  const sessionIdCandidate =
    preferredSessionId?.trim() ||
    process.env.STREAM_SESSION_ID?.trim() ||
    process.env.STREAM555_DEFAULT_SESSION_ID?.trim();
  const sessionResponse = await requestGamesAgentJson(
    upstreamBase,
    requestId?.trim() || createAgentRequestId("api-five55-games-session"),
    "POST",
    "/api/agent/v1/sessions",
    sessionIdCandidate ? { sessionId: sessionIdCandidate } : {},
  );
  if (!sessionResponse.ok) {
    throw new Error(
      `Session bootstrap failed (${sessionResponse.status}): ${extractGamesUpstreamError(
        sessionResponse.data,
        sessionResponse.rawBody,
      )} [requestId: ${sessionResponse.requestId}]`,
    );
  }
  if (
    !sessionResponse.data ||
    typeof sessionResponse.data.sessionId !== "string" ||
    !sessionResponse.data.sessionId.trim()
  ) {
    throw new Error("Session bootstrap did not return sessionId");
  }
  return sessionResponse.data.sessionId;
}
