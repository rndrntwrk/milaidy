export type AliceConnectorChannel = "discord" | "telegram";

export type AliceConnectorIntent = {
  intentId: string;
  action: "social.message";
  target: string;
  argumentHash: string;
  nonce: string;
  expiresAt: number;
  capabilityId: string;
  programDigest: string;
  releaseDigest: string;
  policyHash: string;
};

type ConnectorRecordKind =
  | "configVersion"
  | "connectorCursor"
  | "approvalReceipt";

export type ConnectorRecordInput = {
  kind: ConnectorRecordKind;
  recordId: string;
  ownerId: string;
  sessionId: string;
  payload: Record<string, unknown>;
  updatedAt: number;
};

export type ConnectorRecord = ConnectorRecordInput & {
  revision: number;
};

export interface ConnectorCanonicalState {
  get(
    kind: ConnectorRecordKind,
    recordId: string,
    ownerId: string,
  ): Promise<ConnectorRecord | null>;
  atomic(
    operationId: string,
    records: ConnectorRecordInput[],
  ): Promise<unknown>;
  advanceCursor(
    ownerId: string,
    sessionId: string,
    connector: AliceConnectorChannel,
    cursor: string,
    observedAt: number,
  ): Promise<unknown>;
}

export interface ConnectorOutboundGateStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

type OutboundGateRecord = {
  schemaVersion: "alice.connector-outbound-gate.v1";
  ownerId: string;
  channel: AliceConnectorChannel;
  operationId: string;
  requestSha256: string;
  state: "pending" | "completed" | "denied";
  providerMessageId: string | null;
  observedAt: number;
};

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const DISCORD_ID = /^[1-9][0-9]{16,19}$/;
const TELEGRAM_PRIVATE_ID = /^[1-9][0-9]{4,19}$/;
const TELEGRAM_TOKEN = /^[1-9][0-9]{4,11}:[A-Za-z0-9_-]{20,128}$/;
const OPERATION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,72}$/;

function validSecret(value: string): boolean {
  return value.length >= 20 && value.length <= 256 && !/[\r\n\0]/.test(value);
}

function gateKey(
  ownerId: string,
  channel: AliceConnectorChannel,
  operationId: string,
): string {
  return `outbound:${ownerId}:${channel}:${operationId}`;
}

function validGateRecord(value: unknown): value is OutboundGateRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as OutboundGateRecord;
  return (
    record.schemaVersion === "alice.connector-outbound-gate.v1" &&
    ID.test(record.ownerId) &&
    (record.channel === "discord" || record.channel === "telegram") &&
    OPERATION_ID.test(record.operationId) &&
    DIGEST.test(record.requestSha256) &&
    ["pending", "completed", "denied"].includes(record.state) &&
    (record.providerMessageId === null || ID.test(record.providerMessageId)) &&
    Number.isSafeInteger(record.observedAt) &&
    record.observedAt > 0
  );
}

export class AliceConnectorOutboundGate {
  constructor(private readonly storage: ConnectorOutboundGateStorage) {}

  async claim(
    ownerId: string,
    channel: AliceConnectorChannel,
    operationId: string,
    requestSha256: string,
    observedAt: number,
  ): Promise<
    | { state: "new" }
    | { state: "pending" | "denied" }
    | { state: "completed"; providerMessageId: string }
  > {
    if (
      !ID.test(ownerId) ||
      !OPERATION_ID.test(operationId) ||
      !DIGEST.test(requestSha256) ||
      !Number.isSafeInteger(observedAt) ||
      observedAt <= 0
    ) {
      throw new Error("CONNECTOR_GATE_INPUT_INVALID");
    }
    const key = gateKey(ownerId, channel, operationId);
    const existing = await this.storage.get<unknown>(key);
    if (existing !== undefined) {
      if (!validGateRecord(existing))
        throw new Error("CONNECTOR_GATE_STATE_INVALID");
      if (
        existing.ownerId !== ownerId ||
        existing.channel !== channel ||
        existing.operationId !== operationId
      ) {
        throw new Error("CONNECTOR_GATE_STATE_INVALID");
      }
      if (existing.requestSha256 !== requestSha256) {
        throw new Error("CONNECTOR_IDEMPOTENCY_COLLISION");
      }
      if (existing.state === "completed") {
        if (!existing.providerMessageId)
          throw new Error("CONNECTOR_GATE_STATE_INVALID");
        return {
          state: "completed",
          providerMessageId: existing.providerMessageId,
        };
      }
      return { state: existing.state };
    }
    await this.storage.put(key, {
      schemaVersion: "alice.connector-outbound-gate.v1",
      ownerId,
      channel,
      operationId,
      requestSha256,
      state: "pending",
      providerMessageId: null,
      observedAt,
    } satisfies OutboundGateRecord);
    return { state: "new" };
  }

  async complete(
    ownerId: string,
    channel: AliceConnectorChannel,
    operationId: string,
    requestSha256: string,
    providerMessageId: string,
    observedAt: number,
  ): Promise<void> {
    if (!ID.test(providerMessageId))
      throw new Error("CONNECTOR_PROVIDER_ID_INVALID");
    const key = gateKey(ownerId, channel, operationId);
    const existing = await this.storage.get<unknown>(key);
    if (
      !validGateRecord(existing) ||
      existing.state !== "pending" ||
      existing.requestSha256 !== requestSha256
    ) {
      throw new Error("CONNECTOR_GATE_STATE_INVALID");
    }
    await this.storage.put(key, {
      ...existing,
      state: "completed",
      providerMessageId,
      observedAt,
    } satisfies OutboundGateRecord);
  }

  async deny(
    ownerId: string,
    channel: AliceConnectorChannel,
    operationId: string,
    requestSha256: string,
    observedAt: number,
  ): Promise<void> {
    const key = gateKey(ownerId, channel, operationId);
    const existing = await this.storage.get<unknown>(key);
    if (
      !validGateRecord(existing) ||
      existing.state !== "pending" ||
      existing.requestSha256 !== requestSha256
    ) {
      throw new Error("CONNECTOR_GATE_STATE_INVALID");
    }
    await this.storage.put(key, {
      ...existing,
      state: "denied",
      observedAt,
    } satisfies OutboundGateRecord);
  }
}

type ConnectorConfig = {
  discord: {
    token: string;
    applicationId: string;
    privateDestinationId: string;
  };
  telegram: {
    token: string;
    privateDestinationId: string;
  };
};

type ConnectorDependencies = {
  ownerId: string;
  sessionId: string;
  config: ConnectorConfig;
  state: ConnectorCanonicalState;
  outboundGate: Pick<AliceConnectorOutboundGate, "claim" | "complete" | "deny">;
  authority: {
    authorize(
      intent: AliceConnectorIntent,
    ): Promise<{ allowed: boolean; code: string }>;
  };
  transport: {
    send(input: {
      channel: AliceConnectorChannel;
      destinationId: string;
      text: string;
    }): Promise<{ providerMessageId: string }>;
  };
  now: () => number;
};

function activation(config: ConnectorConfig, channel: AliceConnectorChannel) {
  const admitted =
    channel === "discord"
      ? validSecret(config.discord.token) &&
        DISCORD_ID.test(config.discord.applicationId) &&
        DISCORD_ID.test(config.discord.privateDestinationId)
      : TELEGRAM_TOKEN.test(config.telegram.token) &&
        TELEGRAM_PRIVATE_ID.test(config.telegram.privateDestinationId);
  return admitted
    ? { state: "ready" as const, reason: "private-destination-bound" }
    : {
        state: "inert" as const,
        reason: "credential-or-private-destination-missing",
      };
}

function configuredDestination(
  config: ConnectorConfig,
  channel: AliceConnectorChannel,
) {
  return channel === "discord"
    ? config.discord.privateDestinationId
    : config.telegram.privateDestinationId;
}

function assertBaseInput(
  dependencies: ConnectorDependencies,
  channel: AliceConnectorChannel,
  destinationId: string,
  operationId: string,
) {
  if (
    !ID.test(dependencies.ownerId) ||
    !ID.test(dependencies.sessionId) ||
    !OPERATION_ID.test(operationId)
  )
    throw new Error("CONNECTOR_INPUT_INVALID");
  if (activation(dependencies.config, channel).state !== "ready") {
    throw new Error("CONNECTOR_INERT");
  }
  if (destinationId !== configuredDestination(dependencies.config, channel)) {
    throw new Error("CONNECTOR_DESTINATION_DENIED");
  }
}

function recordId(channel: AliceConnectorChannel, suffix: string) {
  return `connector-${channel}-${suffix}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export function connectorArgumentHash(input: {
  channel: AliceConnectorChannel;
  destinationId: string;
  operationId: string;
  text: string;
}): Promise<string> {
  return sha256(
    JSON.stringify({
      schemaVersion: "alice.connector-egress.v1",
      channel: input.channel,
      destinationId: input.destinationId,
      operationId: input.operationId,
      text: input.text,
    }),
  );
}

function exactIntent(
  intent: AliceConnectorIntent,
  channel: AliceConnectorChannel,
  destinationId: string,
  operationId: string,
  argumentHash: string,
): boolean {
  return (
    ID.test(intent.intentId) &&
    intent.action === "social.message" &&
    intent.target === `connector:${channel}:${destinationId}` &&
    intent.argumentHash === argumentHash &&
    ID.test(intent.nonce) &&
    Number.isSafeInteger(intent.expiresAt) &&
    ID.test(intent.capabilityId) &&
    DIGEST.test(intent.programDigest) &&
    DIGEST.test(intent.releaseDigest) &&
    DIGEST.test(intent.policyHash) &&
    OPERATION_ID.test(operationId)
  );
}

export function createAliceConnectorPlane(dependencies: ConnectorDependencies) {
  const receiptRecordId = (
    channel: AliceConnectorChannel,
    direction: "inbound" | "outbound",
    operationId: string,
  ) => recordId(channel, `${direction}-${operationId}`);

  async function persistOutboundReceipt(input: {
    channel: AliceConnectorChannel;
    destinationId: string;
    operationId: string;
    requestSha256: string;
    providerMessageId: string;
    observedAt: number;
  }) {
    await dependencies.state.atomic(
      `connector-outbound-${input.channel}-${input.operationId}`,
      [
        {
          kind: "approvalReceipt",
          recordId: receiptRecordId(
            input.channel,
            "outbound",
            input.operationId,
          ),
          ownerId: dependencies.ownerId,
          sessionId: dependencies.sessionId,
          payload: {
            schemaVersion: "alice.connector-receipt.v1",
            channel: input.channel,
            direction: "outbound",
            operationId: input.operationId,
            destinationId: input.destinationId,
            payloadSha256: input.requestSha256,
            providerMessageId: input.providerMessageId,
          },
          updatedAt: input.observedAt,
        },
      ],
    );
  }

  return {
    status() {
      return {
        discord: activation(dependencies.config, "discord"),
        telegram: activation(dependencies.config, "telegram"),
      };
    },

    async restore(channel: AliceConnectorChannel) {
      return {
        identity:
          (
            await dependencies.state.get(
              "configVersion",
              recordId(channel, "identity"),
              dependencies.ownerId,
            )
          )?.payload ?? null,
        cursor:
          (
            await dependencies.state.get(
              "connectorCursor",
              recordId(channel, "cursor"),
              dependencies.ownerId,
            )
          )?.payload ?? null,
      };
    },

    async recordInbound(input: {
      channel: AliceConnectorChannel;
      destinationId: string;
      operationId: string;
      cursor: string;
      providerIdentityId: string;
      payloadSha256: string;
      observedAt: number;
    }) {
      assertBaseInput(
        dependencies,
        input.channel,
        input.destinationId,
        input.operationId,
      );
      if (
        !ID.test(input.cursor) ||
        !ID.test(input.providerIdentityId) ||
        !DIGEST.test(input.payloadSha256) ||
        !Number.isSafeInteger(input.observedAt) ||
        input.observedAt <= 0
      )
        throw new Error("CONNECTOR_INPUT_INVALID");
      const receiptId = receiptRecordId(
        input.channel,
        "inbound",
        input.operationId,
      );
      const existing = await dependencies.state.get(
        "approvalReceipt",
        receiptId,
        dependencies.ownerId,
      );
      if (existing) {
        const payload = existing.payload;
        if (
          payload.schemaVersion !== "alice.connector-receipt.v1" ||
          payload.channel !== input.channel ||
          payload.direction !== "inbound" ||
          payload.operationId !== input.operationId ||
          payload.destinationId !== input.destinationId ||
          payload.payloadSha256 !== input.payloadSha256
        ) {
          throw new Error("CONNECTOR_IDEMPOTENCY_COLLISION");
        }
        await dependencies.state.advanceCursor(
          dependencies.ownerId,
          dependencies.sessionId,
          input.channel,
          input.cursor,
          input.observedAt,
        );
        return { duplicate: true, receipt: payload };
      }
      const expectedProviderIdentity =
        input.channel === "discord"
          ? dependencies.config.discord.applicationId
          : dependencies.config.telegram.token.split(":", 1)[0];
      if (input.providerIdentityId !== expectedProviderIdentity) {
        throw new Error("CONNECTOR_IDENTITY_MISMATCH");
      }
      const applicationId =
        input.channel === "discord"
          ? dependencies.config.discord.applicationId
          : null;
      const identity = {
        schemaVersion: "alice.connector-identity.v1",
        channel: input.channel,
        providerIdentityId: input.providerIdentityId,
        applicationId,
      };
      const cursor = {
        schemaVersion: "alice.connector-cursor.v1",
        channel: input.channel,
        destinationId: input.destinationId,
        cursor: input.cursor,
        observedAt: input.observedAt,
      };
      const receipt = {
        schemaVersion: "alice.connector-receipt.v1",
        channel: input.channel,
        direction: "inbound",
        operationId: input.operationId,
        destinationId: input.destinationId,
        payloadSha256: input.payloadSha256,
      };
      await dependencies.state.atomic(
        `connector-inbound-${input.channel}-${input.operationId}`,
        [
          {
            kind: "configVersion",
            recordId: recordId(input.channel, "identity"),
            ownerId: dependencies.ownerId,
            sessionId: dependencies.sessionId,
            payload: identity,
            updatedAt: input.observedAt,
          },
          {
            kind: "connectorCursor",
            recordId: recordId(input.channel, "cursor"),
            ownerId: dependencies.ownerId,
            sessionId: dependencies.sessionId,
            payload: cursor,
            updatedAt: input.observedAt,
          },
          {
            kind: "approvalReceipt",
            recordId: receiptId,
            ownerId: dependencies.ownerId,
            sessionId: dependencies.sessionId,
            payload: receipt,
            updatedAt: input.observedAt,
          },
        ],
      );
      await dependencies.state.advanceCursor(
        dependencies.ownerId,
        dependencies.sessionId,
        input.channel,
        input.cursor,
        input.observedAt,
      );
      return { duplicate: false, receipt };
    },

    async sendOutbound(input: {
      channel: AliceConnectorChannel;
      destinationId: string;
      operationId: string;
      text: string;
      intent: AliceConnectorIntent;
    }) {
      assertBaseInput(
        dependencies,
        input.channel,
        input.destinationId,
        input.operationId,
      );
      if (
        typeof input.text !== "string" ||
        input.text.length < 1 ||
        input.text.length > 4_000 ||
        /[\0]/.test(input.text)
      ) {
        throw new Error("CONNECTOR_INPUT_INVALID");
      }
      const requestSha256 = await connectorArgumentHash(input);
      if (
        !exactIntent(
          input.intent,
          input.channel,
          input.destinationId,
          input.operationId,
          requestSha256,
        )
      ) {
        throw new Error("CONNECTOR_AUTHORIZATION_INVALID");
      }
      const claim = await dependencies.outboundGate.claim(
        dependencies.ownerId,
        input.channel,
        input.operationId,
        requestSha256,
        dependencies.now(),
      );
      if (claim.state === "pending")
        throw new Error("CONNECTOR_OUTBOUND_UNCERTAIN");
      if (claim.state === "denied")
        throw new Error("CONNECTOR_AUTHORIZATION_REQUIRED");
      if (claim.state === "completed") {
        await persistOutboundReceipt({
          ...input,
          requestSha256,
          providerMessageId: claim.providerMessageId,
          observedAt: dependencies.now(),
        });
        return { duplicate: true, providerMessageId: claim.providerMessageId };
      }
      const authorization = await dependencies.authority.authorize(
        input.intent,
      );
      if (
        authorization.allowed !== true ||
        authorization.code !== "CAPABILITY_AUTHORIZED"
      ) {
        await dependencies.outboundGate.deny(
          dependencies.ownerId,
          input.channel,
          input.operationId,
          requestSha256,
          dependencies.now(),
        );
        throw new Error("CONNECTOR_AUTHORIZATION_REQUIRED");
      }
      const sent = await dependencies.transport.send({
        channel: input.channel,
        destinationId: input.destinationId,
        text: input.text,
      });
      if (!ID.test(sent.providerMessageId))
        throw new Error("CONNECTOR_PROVIDER_RESPONSE_INVALID");
      const completedAt = dependencies.now();
      await dependencies.outboundGate.complete(
        dependencies.ownerId,
        input.channel,
        input.operationId,
        requestSha256,
        sent.providerMessageId,
        completedAt,
      );
      await persistOutboundReceipt({
        ...input,
        requestSha256,
        providerMessageId: sent.providerMessageId,
        observedAt: completedAt,
      });
      return { duplicate: false, providerMessageId: sent.providerMessageId };
    },
  };
}

export type AliceConnectorPlane = ReturnType<typeof createAliceConnectorPlane>;
