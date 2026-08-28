import {
  AliceCoordinationLedger,
  coordinationDurableName,
  type CoordinationStorage,
} from "./state-plane";
export { AliceCoordinationLedger } from "./state-plane";

type DurableStorageBinding = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};

export class DurableObjectCoordinationStorage implements CoordinationStorage {
  constructor(private readonly storage: DurableStorageBinding) {}

  get(key: string): Promise<unknown> {
    return this.storage.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.storage.put(key, value);
  }
}

type CoordinationIdentity = {
  schemaVersion: "alice.coordination-identity.v1";
  ownerId: string;
  sessionId: string;
};

function validateIdentity(value: unknown): CoordinationIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identity = value as CoordinationIdentity;
  if (Object.keys(identity).sort().join(",") !== "ownerId,schemaVersion,sessionId") return null;
  try {
    coordinationDurableName(identity.ownerId, identity.sessionId);
  } catch {
    return null;
  }
  return identity.schemaVersion === "alice.coordination-identity.v1" ? identity : null;
}

export class AliceCoordinationObjectCore {
  private ledger: AliceCoordinationLedger | null = null;

  private constructor(
    private readonly storage: CoordinationStorage,
    private identity: CoordinationIdentity | null,
  ) {}

  static async restore(storage: CoordinationStorage): Promise<AliceCoordinationObjectCore> {
    const stored = await storage.get("identity");
    if (stored !== undefined && validateIdentity(stored) === null) {
      throw new Error("COORDINATION_IDENTITY_STATE_INVALID");
    }
    return new AliceCoordinationObjectCore(storage, validateIdentity(stored));
  }

  async initialize(ownerId: string, sessionId: string) {
    coordinationDurableName(ownerId, sessionId);
    if (this.identity && (this.identity.ownerId !== ownerId || this.identity.sessionId !== sessionId)) {
      throw new Error("COORDINATION_REINITIALIZATION_INVALID");
    }
    if (!this.identity) {
      const identity: CoordinationIdentity = {
        schemaVersion: "alice.coordination-identity.v1",
        ownerId,
        sessionId,
      };
      await this.storage.set("identity", structuredClone(identity));
      this.identity = identity;
    }
    this.ledger ??= await AliceCoordinationLedger.restore(this.storage, ownerId, sessionId);
    return this.ledger.snapshot();
  }

  private requireLedger(): AliceCoordinationLedger {
    if (!this.ledger) throw new Error("COORDINATION_NOT_INITIALIZED");
    return this.ledger;
  }

  snapshot() {
    return this.requireLedger().snapshot();
  }

  connect(connectionId: string, connectedAt: number) {
    return this.requireLedger().connect(connectionId, connectedAt);
  }

  advanceCursor(connector: string, cursor: string, observedAt: number) {
    return this.requireLedger().advanceCursor(connector, cursor, observedAt);
  }
}
