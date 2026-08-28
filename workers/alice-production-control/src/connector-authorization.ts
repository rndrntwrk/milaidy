import { jsonResponse, readBoundedJson } from "./http";
import type { ActionIntent } from "./policy";

type DurableAuthorizationResult = {
  response: Response;
  value: unknown;
};

export type ConnectorAuthorize = (
  intent: ActionIntent,
) => Promise<DurableAuthorizationResult>;

const EXACT_KEYS = [
  "action",
  "argumentHash",
  "capabilityId",
  "expiresAt",
  "intentId",
  "nonce",
  "policyHash",
  "programDigest",
  "releaseDigest",
  "target",
].join(",");
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const NONCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PRIVATE_CONNECTOR_TARGET =
  /^(?:connector:discord:[1-9][0-9]{16,19}|connector:telegram:[1-9][0-9]{4,19})$/;
const DECISION_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;

export function isConnectorAuthorizationRoute(
  method: string,
  path: string,
): boolean {
  return (
    method === "POST" &&
    path === "/control/internal/v1/connectors/authorize"
  );
}

function exactConnectorIntent(value: unknown): value is ActionIntent & {
  capabilityId: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  return (
    Object.keys(intent).sort().join(",") === EXACT_KEYS &&
    ID.test(String(intent.intentId ?? "")) &&
    intent.action === "social.message" &&
    PRIVATE_CONNECTOR_TARGET.test(String(intent.target ?? "")) &&
    DIGEST.test(String(intent.argumentHash ?? "")) &&
    NONCE.test(String(intent.nonce ?? "")) &&
    Number.isSafeInteger(intent.expiresAt) &&
    Number(intent.expiresAt) > 0 &&
    ID.test(String(intent.capabilityId ?? "")) &&
    DIGEST.test(String(intent.programDigest ?? "")) &&
    DIGEST.test(String(intent.releaseDigest ?? "")) &&
    DIGEST.test(String(intent.policyHash ?? ""))
  );
}

export async function handleConnectorAuthorization(
  request: Request,
  authorize: ConnectorAuthorize,
): Promise<Response> {
  const candidate = await readBoundedJson(request);
  if (!exactConnectorIntent(candidate)) {
    return jsonResponse(
      { ok: false, allowed: false, code: "CONNECTOR_INTENT_INVALID" },
      400,
    );
  }

  const authorized = await authorize(candidate);
  const envelope =
    authorized.value &&
    typeof authorized.value === "object" &&
    !Array.isArray(authorized.value)
      ? (authorized.value as Record<string, unknown>)
      : null;
  const decision =
    envelope?.decision &&
    typeof envelope.decision === "object" &&
    !Array.isArray(envelope.decision)
      ? (envelope.decision as Record<string, unknown>)
      : null;
  const allowed = decision?.allowed;
  const code = decision?.code;
  const validDecision =
    authorized.response.ok &&
    envelope?.ok === true &&
    typeof allowed === "boolean" &&
    typeof code === "string" &&
    DECISION_CODE.test(code) &&
    ((allowed === true && code === "CAPABILITY_AUTHORIZED") ||
      (allowed === false && code !== "CAPABILITY_AUTHORIZED"));
  if (!validDecision) {
    return jsonResponse(
      {
        ok: false,
        allowed: false,
        code: "CONNECTOR_AUTHORITY_RESPONSE_INVALID",
      },
      503,
    );
  }

  return jsonResponse(
    { ok: allowed, allowed, code },
    allowed ? 200 : 403,
  );
}
