import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import {
  AliceGameplayObserver,
  validateAliceGameplayObservation,
} from "../plugins/five55-games/alice-gameplay-observer.js";
import {
  AliceGameplayMemoryPersistence,
  type AliceGameplayMemoryRuntime,
} from "../plugins/five55-games/alice-gameplay-memory-persistence.js";
import {
  AliceReactionBridge,
  type StreamControlBroadcastPort,
} from "../plugins/five55-games/alice-reaction-bridge.js";

export const ALICE_GAMEPLAY_OBSERVATION_PATH =
  "/api/alice/gameplay-observation";
export function isAliceGameplayObserverAuthenticated(
  headers: http.IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const secret = env.ALICE_GAMEPLAY_OBSERVER_TOKEN;
  const provided = headers.authorization;
  if (!secret || secret.length < 32 || typeof provided !== "string")
    return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
type Runtime = AliceGameplayMemoryRuntime & {
  getService(name: string): unknown;
};
type Stream = StreamControlBroadcastPort & {
  getStreamStatus(
    sessionId: string,
  ): Promise<{ jobId?: string; status?: string }>;
};
const observers = new WeakMap<
  object,
  {
    sessionId: string;
    stream: Stream;
    broadcastWs: unknown;
    observer: AliceGameplayObserver;
  }
>();
export async function handleAliceGameplayObservationRoutes(ctx: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  json(res: http.ServerResponse, body: object, status?: number): void;
  runtime?: unknown;
  broadcastWs?: (payload: Record<string, unknown>) => void;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  if (ctx.pathname !== ALICE_GAMEPLAY_OBSERVATION_PATH) return false;
  if (ctx.method !== "POST") {
    ctx.json(ctx.res, { error: "Method not allowed" }, 405);
    return true;
  }
  const env = ctx.env ?? process.env;
  if (!isAliceGameplayObserverAuthenticated(ctx.req.headers, env)) {
    ctx.json(ctx.res, { error: "Trusted gameplay observer required" }, 401);
    return true;
  }
  const runtime = ctx.runtime as Runtime | undefined;
  const sessionId = env.ALICE_GAMEPLAY_OBSERVER_SESSION_ID;
  const stream = runtime?.getService?.("stream555") as Stream | undefined;
  if (
    !sessionId ||
    !runtime?.createMemory ||
    !runtime.getMemoryById ||
    !runtime.updateMemory ||
    !stream?.broadcastEvent ||
    !stream.getStreamStatus ||
    !ctx.broadcastWs
  ) {
    ctx.json(ctx.res, { error: "Gameplay observer unavailable" }, 503);
    return true;
  }
  let body: ReturnType<typeof validateAliceGameplayObservation>;
  try {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of ctx.req) {
      const b = Buffer.from(chunk);
      bytes += b.length;
      if (bytes > 4096) {
        ctx.json(ctx.res, { error: "Observation too large" }, 413);
        return true;
      }
      chunks.push(b);
    }
    body = validateAliceGameplayObservation(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (body.sessionId !== sessionId)
      throw new Error("Gameplay session mismatch");
  } catch {
    ctx.json(ctx.res, { error: "Invalid gameplay observation" }, 400);
    return true;
  }
  try {
    const observation = body as ReturnType<
      typeof validateAliceGameplayObservation
    >;
    const status = await stream.getStreamStatus(sessionId);
    if (
      status.jobId !== observation.dispatchId ||
      !["starting", "connecting", "live", "reconnecting"].includes(
        status.status ?? "",
      )
    ) {
      ctx.json(ctx.res, { error: "Gameplay dispatch is not current" }, 409);
      return true;
    }
    let entry = observers.get(runtime);
    if (
      !entry ||
      entry.sessionId !== sessionId ||
      entry.stream !== stream ||
      entry.broadcastWs !== ctx.broadcastWs
    ) {
      const persistence = new AliceGameplayMemoryPersistence(
        runtime,
        runtime.agentId,
      );
      const bridge = new AliceReactionBridge({
        persistence,
        streamControl: stream,
        broadcastWs: ctx.broadcastWs,
      });
      entry = {
        sessionId,
        stream,
        broadcastWs: ctx.broadcastWs,
        observer: new AliceGameplayObserver({ sessionId, persistence, bridge }),
      };
      observers.set(runtime, entry);
    }
    ctx.json(ctx.res, await entry.observer.observe(observation));
  } catch {
    ctx.json(
      ctx.res,
      { error: "Gameplay observation delivery unavailable" },
      503,
    );
  }
  return true;
}
