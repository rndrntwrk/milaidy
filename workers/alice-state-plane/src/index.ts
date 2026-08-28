import { DurableObject } from "cloudflare:workers";

import { DurableObjectCoordinationStorage } from "./coordination-storage";
import { createAliceStateService } from "./service";
import {
  AliceCoordinationLedger,
  D1AliceStateAdapter,
  parseCoordinationDurableName,
} from "./state-plane";

export class AliceStateCoordination extends DurableObject<Cloudflare.Env> {
  private readonly ready: Promise<AliceCoordinationLedger>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    const name = parseCoordinationDurableName(ctx.id.name ?? "");
    this.ready = ctx.blockConcurrencyWhile(() =>
      AliceCoordinationLedger.restore(
        new DurableObjectCoordinationStorage(ctx.storage),
        name.ownerId,
        name.sessionId,
      ));
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
    return createAliceStateService({
      adapter,
      token: env.ALICE_STATE_PLANE_SERVICE_TOKEN,
    }).fetch(request);
  },
} satisfies ExportedHandler<AliceStateRuntimeEnv>;
