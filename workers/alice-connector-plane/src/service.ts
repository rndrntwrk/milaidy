import type {
  AliceConnectorChannel,
  AliceConnectorPlane,
} from "./connector-plane";

type ConnectorPlane = Pick<
  AliceConnectorPlane,
  "status" | "restore" | "recordInbound" | "sendOutbound"
>;

const MAX_REQUEST_BYTES = 65_536;

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function fixedStringEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const width = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < width; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new Error("CONNECTOR_REQUEST_TOO_LARGE");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES)
    throw new Error("CONNECTOR_REQUEST_TOO_LARGE");
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CONNECTOR_REQUEST_INVALID");
  }
  return value as Record<string, unknown>;
}

export function createAliceConnectorService(input: {
  token: string;
  planeFor(channel: AliceConnectorChannel): ConnectorPlane;
}) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== "/v1/connectors") {
        return json({ ok: false, code: "CONNECTOR_ROUTE_NOT_FOUND" }, 404);
      }
      if (request.method !== "POST") {
        return json({ ok: false, code: "CONNECTOR_METHOD_INVALID" }, 405);
      }
      if (
        request.headers.has("origin") ||
        input.token.length < 32 ||
        !fixedStringEqual(
          request.headers.get("x-alice-connector-token") ?? "",
          input.token,
        )
      ) {
        return json({ ok: false, code: "CONNECTOR_SERVICE_UNAUTHORIZED" }, 401);
      }
      if (
        request.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase() !== "application/json"
      ) {
        return json({ ok: false, code: "CONNECTOR_CONTENT_TYPE_INVALID" }, 415);
      }
      try {
        const body = await readBody(request);
        const channel = body.channel;
        if (channel !== "discord" && channel !== "telegram") {
          throw new Error("CONNECTOR_INPUT_INVALID");
        }
        const plane = input.planeFor(channel);
        if (body.operation === "connector.status") {
          return json({ ok: true, channels: plane.status() }, 200);
        }
        if (body.operation === "connector.restore") {
          return json({ ok: true, state: await plane.restore(channel) }, 200);
        }
        if (body.operation === "connector.inbound.record") {
          const { operation: _operation, ...operationInput } = body;
          return json(
            {
              ok: true,
              receipt: await plane.recordInbound(
                operationInput as Parameters<
                  ConnectorPlane["recordInbound"]
                >[0],
              ),
            },
            200,
          );
        }
        if (body.operation === "connector.outbound.send") {
          const { operation: _operation, ...operationInput } = body;
          return json(
            {
              ok: true,
              receipt: await plane.sendOutbound(
                operationInput as Parameters<
                  ConnectorPlane["sendOutbound"]
                >[0],
              ),
            },
            200,
          );
        }
        throw new Error("CONNECTOR_OPERATION_UNSUPPORTED");
      } catch (error) {
        const code =
          error instanceof Error && /^CONNECTOR_[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : "CONNECTOR_REQUEST_INVALID";
        return json(
          { ok: false, code },
          code === "CONNECTOR_REQUEST_TOO_LARGE" ? 413 : 400,
        );
      }
    },
  };
}
