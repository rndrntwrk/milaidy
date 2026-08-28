import { DurableObject } from "cloudflare:workers";

import {
  AliceCoordinationObjectCore,
  DurableObjectCoordinationStorage,
} from "./coordination-storage";
import { createAliceStateService } from "./service";
import { D1ElizaDatabaseAdapter } from "./eliza-database";
import {
  AliceObjectStore,
  AliceVectorStore,
  D1AliceStateAdapter,
  coordinationDurableName,
} from "./state-plane";

export class AliceStateCoordination extends DurableObject<Cloudflare.Env> {
  private readonly ready: Promise<AliceCoordinationObjectCore>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(() =>
      AliceCoordinationObjectCore.restore(new DurableObjectCoordinationStorage(ctx.storage)));
  }

  async initialize(ownerId: string, sessionId: string) {
    return (await this.ready).initialize(ownerId, sessionId);
  }

  async snapshot() {
    return (await this.ready).snapshot();
  }

  async registerConnection(connectionId: string, connectedAt: number) {
    return (await this.ready).connect(connectionId, connectedAt);
  }

  async advanceCursor(connector: string, cursor: string, observedAt: number) {
    return (await this.ready).advanceCursor(connector, cursor, observedAt);
  }
}

type AliceStateRuntimeEnv = Cloudflare.Env & Readonly<{
  ALICE_STATE_PLANE_SERVICE_TOKEN: string;
}>;

export default {
  async fetch(request: Request, env: AliceStateRuntimeEnv): Promise<Response> {
    const adapter = new D1AliceStateAdapter(env.ALICE_STATE_DB);
    const elizaDatabase = new D1ElizaDatabaseAdapter(env.ALICE_STATE_DB);
    const vectorStore = new AliceVectorStore(env.ALICE_MEMORY_INDEX, {
      indexName: env.ALICE_VECTOR_INDEX_NAME,
      model: env.ALICE_VECTOR_MODEL,
      dimensions: Number(env.ALICE_VECTOR_DIMENSIONS),
    }, adapter);
    const objectStore = new AliceObjectStore(env.ALICE_STATE_OBJECTS, adapter);
    const coordinationStub = (ownerId: string, sessionId: string) =>
      env.ALICE_COORDINATION.getByName(coordinationDurableName(ownerId, sessionId));
    const coordination = {
      async initialize(ownerId: string, sessionId: string) {
        return coordinationStub(ownerId, sessionId).initialize(ownerId, sessionId);
      },
      async snapshot(ownerId: string, sessionId: string) {
        const stub = coordinationStub(ownerId, sessionId);
        await stub.initialize(ownerId, sessionId);
        return stub.snapshot();
      },
      async connect(ownerId: string, sessionId: string, connectionId: string, connectedAt: number) {
        const stub = coordinationStub(ownerId, sessionId);
        await stub.initialize(ownerId, sessionId);
        return stub.registerConnection(connectionId, connectedAt);
      },
      async advanceCursor(ownerId: string, sessionId: string, connector: string, cursor: string, observedAt: number) {
        const stub = coordinationStub(ownerId, sessionId);
        await stub.initialize(ownerId, sessionId);
        return stub.advanceCursor(connector, cursor, observedAt);
      },
    };
    return createAliceStateService({
      adapter,
      vectorStore,
      objectStore,
      coordination,
      elizaDatabase,
      token: env.ALICE_STATE_PLANE_SERVICE_TOKEN,
    }).fetch(request);
  },
} satisfies ExportedHandler<AliceStateRuntimeEnv>;
