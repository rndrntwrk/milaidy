import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface AliceCompanionStageCamera {
  zoom: number;
  yaw: number;
  pitch: number;
  pan: number;
}

export interface AliceCompanionStageState {
  camera: AliceCompanionStageCamera;
}

export interface AliceCompanionStageStore {
  read(): Promise<AliceCompanionStageState | null>;
  write(state: AliceCompanionStageState, updatedAt?: number): Promise<void>;
}

type FetchImplementation = (request: Request) => Promise<Response>;

const INTERNAL_STATE_URL = "http://alice-state-plane.internal/v1/state";
const OWNER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const RECORD_ID = "companion-stage-v1";
const SCHEMA_VERSION = "alice.companion-stage-state.v1";

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort())
  );
}

function validStage(value: unknown): value is AliceCompanionStageState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (
    !exactKeys(state, ["camera"]) ||
    !state.camera ||
    typeof state.camera !== "object" ||
    Array.isArray(state.camera)
  )
    return false;
  const camera = state.camera as Record<string, unknown>;
  if (!exactKeys(camera, ["pan", "pitch", "yaw", "zoom"])) return false;
  return (
    typeof camera.zoom === "number" &&
    Number.isFinite(camera.zoom) &&
    camera.zoom >= 0 &&
    camera.zoom <= 1 &&
    typeof camera.yaw === "number" &&
    Number.isFinite(camera.yaw) &&
    camera.yaw >= -Math.PI &&
    camera.yaw <= Math.PI &&
    typeof camera.pitch === "number" &&
    Number.isFinite(camera.pitch) &&
    camera.pitch >= -Math.PI / 2 &&
    camera.pitch <= Math.PI / 2 &&
    typeof camera.pan === "number" &&
    Number.isFinite(camera.pan) &&
    camera.pan >= -5 &&
    camera.pan <= 5
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("ALICE_COMPANION_STATE_UNAVAILABLE");
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ALICE_COMPANION_STATE_INVALID");
  }
  return value as Record<string, unknown>;
}

export function createAliceCompanionStageStore(input: {
  ownerId?: string;
  statePlaneUrl?: string;
  fetchImpl?: FetchImplementation;
}): AliceCompanionStageStore {
  if (
    !input.ownerId ||
    !input.statePlaneUrl ||
    !OWNER_ID.test(input.ownerId) ||
    input.statePlaneUrl !== INTERNAL_STATE_URL
  ) {
    throw new Error("ALICE_COMPANION_STATE_CONFIG_INVALID");
  }
  const ownerId = input.ownerId;
  const fetchImpl = input.fetchImpl ?? fetch;
  const invoke = (operation: Record<string, unknown>) =>
    fetchImpl(
      new Request(input.statePlaneUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation),
      }),
    );
  return {
    async read() {
      const envelope = await readJson(
        await invoke({
          operation: "record.get",
          kind: "configVersion",
          recordId: RECORD_ID,
          ownerId,
        }),
      );
      if (envelope.ok !== true)
        throw new Error("ALICE_COMPANION_STATE_INVALID");
      if (envelope.record === null) return null;
      if (
        !envelope.record ||
        typeof envelope.record !== "object" ||
        Array.isArray(envelope.record)
      ) {
        throw new Error("ALICE_COMPANION_STATE_INVALID");
      }
      const payload = (envelope.record as Record<string, unknown>).payload;
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        !exactKeys(payload as Record<string, unknown>, [
          "schemaVersion",
          "state",
        ]) ||
        (payload as Record<string, unknown>).schemaVersion !== SCHEMA_VERSION ||
        !validStage((payload as Record<string, unknown>).state)
      ) {
        throw new Error("ALICE_COMPANION_STATE_INVALID");
      }
      return structuredClone(
        (payload as Record<string, unknown>).state as AliceCompanionStageState,
      );
    },
    async write(state, updatedAt = Date.now()) {
      if (
        !validStage(state) ||
        !Number.isSafeInteger(updatedAt) ||
        updatedAt <= 0
      ) {
        throw new Error("ALICE_COMPANION_STATE_INVALID");
      }
      const payload = { schemaVersion: SCHEMA_VERSION, state };
      const requestSha256 = createHash("sha256")
        .update(`${updatedAt}\n${JSON.stringify(payload)}`)
        .digest("hex");
      const envelope = await readJson(
        await invoke({
          operation: "record.put",
          kind: "configVersion",
          recordId: RECORD_ID,
          ownerId,
          sessionId: "companion-production",
          payload,
          updatedAt,
          idempotencyKey: `companion-stage-${requestSha256}`,
        }),
      );
      if (envelope.ok !== true || !envelope.record) {
        throw new Error("ALICE_COMPANION_STATE_INVALID");
      }
    },
  };
}

function createLocalStageStore(filePath: string): AliceCompanionStageStore {
  return {
    async read() {
      try {
        if (!fs.existsSync(filePath)) return null;
        const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return validStage(value) ? value : null;
      } catch {
        return null;
      }
    },
    async write(state) {
      if (!validStage(state)) throw new Error("ALICE_COMPANION_STATE_INVALID");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    },
  };
}

export function createCompanionStageStoreFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): AliceCompanionStageStore {
  const ownerId = env.ALICE_STATE_OWNER_ID?.trim();
  const statePlaneUrl = env.ALICE_STATE_PLANE_URL?.trim();
  if (ownerId || statePlaneUrl) {
    return createAliceCompanionStageStore({ ownerId, statePlaneUrl });
  }
  const root =
    env.MILAIDY_HOME || env.ELIZA_DATA_DIR || path.join(process.cwd(), "data");
  return createLocalStageStore(path.join(root, "companion", "stage.json"));
}
