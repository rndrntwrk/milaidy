import { DurableObject } from "cloudflare:workers";

import {
  type AliceConnectorChannel,
  type AliceConnectorIntent,
  AliceConnectorOutboundGate,
  type ConnectorCanonicalState,
  type ConnectorOutboundGateStorage,
  type ConnectorRecord,
  createAliceConnectorPlane,
} from "./connector-plane";
import { createAliceConnectorService } from "./service";

type Fetcher = { fetch(request: Request): Promise<Response> };

type AliceConnectorEnv = Cloudflare.Env &
  Readonly<{
    ALICE_CONNECTOR_SERVICE_TOKEN: string;
    ALICE_STATE_PLANE_SERVICE_TOKEN: string;
    ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN: string;
    DISCORD_API_TOKEN: string;
    DISCORD_APPLICATION_ID: string;
    TELEGRAM_BOT_TOKEN: string;
    ALICE_DISCORD_PRIVATE_DESTINATION_ID: string;
    ALICE_TELEGRAM_PRIVATE_DESTINATION_ID: string;
    ALICE_STATE_OWNER_ID: string;
    ALICE_CONNECTOR_SESSION_ID: string;
    ALICE_STATE_PLANE: Fetcher;
    ALICE_CONTROL: Fetcher;
    ALICE_CONNECTOR_OUTBOUND: {
      getByName(name: string): {
        claim(
          ...args: Parameters<AliceConnectorOutboundGate["claim"]>
        ): ReturnType<AliceConnectorOutboundGate["claim"]>;
        complete(
          ...args: Parameters<AliceConnectorOutboundGate["complete"]>
        ): ReturnType<AliceConnectorOutboundGate["complete"]>;
        deny(
          ...args: Parameters<AliceConnectorOutboundGate["deny"]>
        ): ReturnType<AliceConnectorOutboundGate["deny"]>;
      };
    };
  }>;

class DurableOutboundStorage implements ConnectorOutboundGateStorage {
  constructor(private readonly storage: DurableObjectStorage) {}
  get<T>(key: string): Promise<T | undefined> {
    return this.storage.get<T>(key);
  }
  put(key: string, value: unknown): Promise<void> {
    return this.storage.put(key, value);
  }
}

export class AliceConnectorOutboundCoordination extends DurableObject<AliceConnectorEnv> {
  private readonly gate: AliceConnectorOutboundGate;

  constructor(ctx: DurableObjectState, env: AliceConnectorEnv) {
    super(ctx, env);
    this.gate = new AliceConnectorOutboundGate(
      new DurableOutboundStorage(ctx.storage),
    );
  }

  claim(...args: Parameters<AliceConnectorOutboundGate["claim"]>) {
    return this.ctx.blockConcurrencyWhile(() => this.gate.claim(...args));
  }

  complete(...args: Parameters<AliceConnectorOutboundGate["complete"]>) {
    return this.ctx.blockConcurrencyWhile(() => this.gate.complete(...args));
  }

  deny(...args: Parameters<AliceConnectorOutboundGate["deny"]>) {
    return this.ctx.blockConcurrencyWhile(() => this.gate.deny(...args));
  }
}

async function stateCall(
  env: AliceConnectorEnv,
  operation: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await env.ALICE_STATE_PLANE.fetch(
    new Request("https://alice-state-plane.internal/v1/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-alice-state-token": env.ALICE_STATE_PLANE_SERVICE_TOKEN,
      },
      body: JSON.stringify(operation),
    }),
  );
  const value: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).ok !== true
  )
    throw new Error("CONNECTOR_STATE_UNAVAILABLE");
  return value as Record<string, unknown>;
}

function canonicalState(env: AliceConnectorEnv): ConnectorCanonicalState {
  return {
    async get(kind, recordId, ownerId) {
      return (
        await stateCall(env, {
          operation: "record.get",
          kind,
          recordId,
          ownerId,
        })
      ).record as ConnectorRecord | null;
    },
    async atomic(operationId, records) {
      return (
        await stateCall(env, {
          operation: "records.atomic",
          operationId,
          records,
        })
      ).records;
    },
    async advanceCursor(ownerId, sessionId, connector, cursor, observedAt) {
      return (
        await stateCall(env, {
          operation: "coordination.cursor",
          ownerId,
          sessionId,
          connector,
          cursor,
          observedAt,
        })
      ).cursor;
    },
  };
}

async function authorize(env: AliceConnectorEnv, intent: AliceConnectorIntent) {
  const response = await env.ALICE_CONTROL.fetch(
    new Request(
      "https://alice-control.internal/control/internal/v1/connectors/authorize",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alice-service-token": env.ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN,
        },
        body: JSON.stringify(intent),
      },
    ),
  );
  const value: unknown = await response.json().catch(() => null);
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    allowed: response.ok && record.allowed === true,
    code:
      typeof record.code === "string"
        ? record.code
        : "CONNECTOR_AUTHORIZATION_UNAVAILABLE",
  };
}

async function providerSend(
  env: AliceConnectorEnv,
  input: {
    channel: AliceConnectorChannel;
    destinationId: string;
    text: string;
  },
) {
  if (input.channel === "discord") {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${input.destinationId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${env.DISCORD_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ content: input.text }),
      },
    );
    const value: unknown = await response.json().catch(() => null);
    const record =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    if (!response.ok || typeof record.id !== "string") {
      throw new Error("CONNECTOR_PROVIDER_RESPONSE_INVALID");
    }
    return { providerMessageId: record.id };
  }
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: input.destinationId, text: input.text }),
    },
  );
  const value: unknown = await response.json().catch(() => null);
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result =
    record.result &&
    typeof record.result === "object" &&
    !Array.isArray(record.result)
      ? (record.result as Record<string, unknown>)
      : {};
  if (
    !response.ok ||
    record.ok !== true ||
    !Number.isSafeInteger(result.message_id)
  ) {
    throw new Error("CONNECTOR_PROVIDER_RESPONSE_INVALID");
  }
  return { providerMessageId: `telegram-${result.message_id}` };
}

function planeFor(env: AliceConnectorEnv, channel: AliceConnectorChannel) {
  return createAliceConnectorPlane({
    ownerId: env.ALICE_STATE_OWNER_ID,
    sessionId: env.ALICE_CONNECTOR_SESSION_ID,
    config: {
      discord: {
        token: env.DISCORD_API_TOKEN,
        applicationId: env.DISCORD_APPLICATION_ID,
        privateDestinationId: env.ALICE_DISCORD_PRIVATE_DESTINATION_ID,
      },
      telegram: {
        token: env.TELEGRAM_BOT_TOKEN,
        privateDestinationId: env.ALICE_TELEGRAM_PRIVATE_DESTINATION_ID,
      },
    },
    state: canonicalState(env),
    outboundGate: env.ALICE_CONNECTOR_OUTBOUND.getByName(
      `${env.ALICE_STATE_OWNER_ID}:${channel}`,
    ),
    authority: { authorize: (intent) => authorize(env, intent) },
    transport: { send: (input) => providerSend(env, input) },
    now: Date.now,
  });
}

export default {
  fetch(request: Request, env: AliceConnectorEnv): Promise<Response> {
    return createAliceConnectorService({
      token: env.ALICE_CONNECTOR_SERVICE_TOKEN,
      planeFor: (channel) => planeFor(env, channel),
    }).fetch(request);
  },
} satisfies ExportedHandler<AliceConnectorEnv>;
