import { describe, expect, test } from "bun:test";

import {
  AliceConnectorOutboundGate,
  type ConnectorCanonicalState,
  type ConnectorOutboundGateStorage,
  type ConnectorRecord,
  connectorArgumentHash,
  createAliceConnectorPlane,
} from "../src/connector-plane";

const now = 1_777_000_000_000;
const digest = (character: string) => `sha256:${character.repeat(64)}`;

function memoryGateStorage(
  backing = new Map<string, unknown>(),
): ConnectorOutboundGateStorage {
  return {
    async get<T>(key: string) {
      return structuredClone(backing.get(key)) as T | undefined;
    },
    async put(key: string, value: unknown) {
      backing.set(key, structuredClone(value));
    },
  };
}

function memoryCanonicalState(): ConnectorCanonicalState & {
  atomicWrites: number;
} {
  const records = new Map<string, ConnectorRecord>();
  const key = (ownerId: string, kind: string, recordId: string) =>
    `${ownerId}:${kind}:${recordId}`;
  return {
    atomicWrites: 0,
    async get(kind, recordId, ownerId) {
      return structuredClone(records.get(key(ownerId, kind, recordId)) ?? null);
    },
    async atomic(_operationId, values) {
      this.atomicWrites += 1;
      for (const value of values) {
        records.set(key(value.ownerId, value.kind, value.recordId), {
          ...structuredClone(value),
          revision: 1,
        });
      }
      return values;
    },
    async advanceCursor() {
      return undefined;
    },
  };
}

async function exactIntent(input: {
  channel: "discord" | "telegram";
  destinationId: string;
  operationId: string;
  text: string;
}) {
  return {
    intentId: `intent-${input.operationId}`,
    action: "social.message",
    target: `connector:${input.channel}:${input.destinationId}`,
    argumentHash: await connectorArgumentHash(input),
    nonce: `nonce-${input.operationId}`,
    expiresAt: now + 60_000,
    capabilityId: `cap-${input.operationId}`,
    programDigest: digest("1"),
    releaseDigest: digest("2"),
    policyHash: digest("3"),
  };
}

function createFixture() {
  const state = memoryCanonicalState();
  const gateBacking = new Map<string, unknown>();
  const sends: unknown[] = [];
  const authorizations: unknown[] = [];
  const config = {
    discord: {
      token: "discord-provider-token",
      applicationId: "123456789012345678",
      privateDestinationId: "234567890123456789",
    },
    telegram: {
      token: "123456789:telegram-provider-token",
      privateDestinationId: "345678901",
    },
  };
  const authority = {
    async authorize(intent: unknown) {
      authorizations.push(structuredClone(intent));
      return { allowed: true as const, code: "CAPABILITY_AUTHORIZED" };
    },
  };
  const transport = {
    async send(input: unknown) {
      sends.push(structuredClone(input));
      return { providerMessageId: `provider-${sends.length}` };
    },
  };
  const build = () =>
    createAliceConnectorPlane({
      ownerId: "owner-production-001",
      sessionId: "session-connectors-001",
      config,
      state,
      outboundGate: new AliceConnectorOutboundGate(
        memoryGateStorage(gateBacking),
      ),
      authority,
      transport,
      now: () => now,
    });
  return {
    plane: build(),
    build,
    state,
    gateBacking,
    sends,
    authorizations,
  };
}

describe("private Alice Discord and Telegram connector plane", () => {
  test("is inert when any exact credential or private allowlist is absent", async () => {
    const state = memoryCanonicalState();
    const sends: unknown[] = [];
    const plane = createAliceConnectorPlane({
      ownerId: "owner-production-001",
      sessionId: "session-connectors-001",
      config: {
        discord: {
          token: "",
          applicationId: "123456789012345678",
          privateDestinationId: "234567890123456789",
        },
        telegram: {
          token: "123456789:telegram-provider-token",
          privateDestinationId: "",
        },
      },
      state,
      outboundGate: new AliceConnectorOutboundGate(memoryGateStorage()),
      authority: {
        async authorize() {
          throw new Error("must stay inert");
        },
      },
      transport: {
        async send(value) {
          sends.push(value);
          throw new Error("must stay inert");
        },
      },
      now: () => now,
    });
    expect(plane.status()).toEqual({
      discord: {
        state: "inert",
        reason: "credential-or-private-destination-missing",
      },
      telegram: {
        state: "inert",
        reason: "credential-or-private-destination-missing",
      },
    });
    await expect(
      plane.sendOutbound({
        channel: "discord",
        destinationId: "234567890123456789",
        operationId: "outbound-001",
        text: "private hello",
        intent: {} as never,
      }),
    ).rejects.toThrow("CONNECTOR_INERT");
    expect(sends).toHaveLength(0);
  });

  test("denies wrong or public destinations before authorization or provider egress", async () => {
    const fixture = createFixture();
    await expect(
      fixture.plane.sendOutbound({
        channel: "discord",
        destinationId: "999999999999999999",
        operationId: "outbound-002",
        text: "no",
        intent: {} as never,
      }),
    ).rejects.toThrow("CONNECTOR_DESTINATION_DENIED");
    await expect(
      fixture.plane.recordInbound({
        channel: "telegram",
        destinationId: "-100123456789",
        operationId: "inbound-001",
        cursor: "update-001",
        providerIdentityId: "bot-001",
        payloadSha256: digest("4"),
        observedAt: now,
      }),
    ).rejects.toThrow("CONNECTOR_DESTINATION_DENIED");
    expect(fixture.authorizations).toHaveLength(0);
    expect(fixture.sends).toHaveLength(0);
  });

  test("rejects an inbound provider identity that does not match the configured bot identity", async () => {
    const fixture = createFixture();
    await expect(
      fixture.plane.recordInbound({
        channel: "discord",
        destinationId: "234567890123456789",
        operationId: "inbound-wrong-identity",
        cursor: "event-00000041",
        providerIdentityId: "999999999999999999",
        payloadSha256: digest("4"),
        observedAt: now,
      }),
    ).rejects.toThrow("CONNECTOR_IDENTITY_MISMATCH");
    expect(fixture.state.atomicWrites).toBe(0);
  });

  test("deduplicates inbound receipts and restores identity and cursor after process replacement", async () => {
    const fixture = createFixture();
    const inbound = {
      channel: "discord" as const,
      destinationId: "234567890123456789",
      operationId: "inbound-002",
      cursor: "event-00000042",
      providerIdentityId: "123456789012345678",
      payloadSha256: digest("5"),
      observedAt: now,
    };
    expect(await fixture.plane.recordInbound(inbound)).toMatchObject({
      duplicate: false,
    });
    expect(await fixture.plane.recordInbound(inbound)).toMatchObject({
      duplicate: true,
    });
    expect(fixture.state.atomicWrites).toBe(1);

    expect(await fixture.build().restore("discord")).toMatchObject({
      identity: { providerIdentityId: "123456789012345678" },
      cursor: { cursor: "event-00000042" },
    });
  });

  test("requires an exact Task 5 release-bound grant and sends an outbound message at most once", async () => {
    const fixture = createFixture();
    const request = {
      channel: "telegram" as const,
      destinationId: "345678901",
      operationId: "outbound-003",
      text: "private hello",
      intent: await exactIntent({
        channel: "telegram",
        destinationId: "345678901",
        operationId: "outbound-003",
        text: "private hello",
      }),
    };
    expect(await fixture.plane.sendOutbound(request)).toMatchObject({
      duplicate: false,
      providerMessageId: "provider-1",
    });
    expect(await fixture.plane.sendOutbound(request)).toMatchObject({
      duplicate: true,
      providerMessageId: "provider-1",
    });
    expect(fixture.sends).toEqual([
      {
        channel: "telegram",
        destinationId: "345678901",
        text: "private hello",
      },
    ]);
    expect(fixture.authorizations).toHaveLength(1);
  });

  test("fails closed on a mismatched or denied Task 5 grant without provider egress", async () => {
    const fixture = createFixture();
    const request = {
      channel: "discord" as const,
      destinationId: "234567890123456789",
      operationId: "outbound-authorization-denied",
      text: "private hello",
      intent: await exactIntent({
        channel: "discord",
        destinationId: "234567890123456789",
        operationId: "outbound-authorization-denied",
        text: "different text",
      }),
    };
    await expect(fixture.plane.sendOutbound(request)).rejects.toThrow(
      "CONNECTOR_AUTHORIZATION_INVALID",
    );
    expect(fixture.authorizations).toHaveLength(0);
    expect(fixture.sends).toHaveLength(0);

    const denied = createAliceConnectorPlane({
      ownerId: "owner-production-001",
      sessionId: "session-connectors-001",
      config: {
        discord: {
          token: "discord-provider-token",
          applicationId: "123456789012345678",
          privateDestinationId: "234567890123456789",
        },
        telegram: {
          token: "123456789:telegram-provider-token",
          privateDestinationId: "345678901",
        },
      },
      state: memoryCanonicalState(),
      outboundGate: new AliceConnectorOutboundGate(memoryGateStorage()),
      authority: {
        async authorize() {
          return { allowed: false, code: "ACTION_DISABLED" };
        },
      },
      transport: {
        async send() {
          throw new Error("must not send");
        },
      },
      now: () => now,
    });
    const deniedOperation = {
      channel: "discord" as const,
      destinationId: "234567890123456789",
      operationId: "outbound-denied",
      text: "private only",
      intent: await exactIntent({
        channel: "discord",
        destinationId: "234567890123456789",
        operationId: "outbound-denied",
        text: "private only",
      }),
    };
    await expect(denied.sendOutbound(deniedOperation)).rejects.toThrow(
      "CONNECTOR_AUTHORIZATION_REQUIRED",
    );
    await expect(denied.sendOutbound(deniedOperation)).rejects.toThrow(
      "CONNECTOR_AUTHORIZATION_REQUIRED",
    );
  });

  test("retains fail-closed uncertainty after restart instead of resending a claimed operation", async () => {
    const backing = new Map<string, unknown>();
    const gate = new AliceConnectorOutboundGate(memoryGateStorage(backing));
    expect(
      await gate.claim(
        "owner-production-001",
        "discord",
        "outbound-004",
        digest("6"),
        now,
      ),
    ).toEqual({ state: "new" });
    const replacement = new AliceConnectorOutboundGate(
      memoryGateStorage(backing),
    );
    expect(
      await replacement.claim(
        "owner-production-001",
        "discord",
        "outbound-004",
        digest("6"),
        now + 1,
      ),
    ).toEqual({ state: "pending" });
    await expect(
      replacement.claim(
        "owner-production-001",
        "discord",
        "outbound-004",
        digest("7"),
        now + 1,
      ),
    ).rejects.toThrow("CONNECTOR_IDEMPOTENCY_COLLISION");
  });
});
