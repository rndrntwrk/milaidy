import path from "node:path";

export const ALICE_CORPUS_PROJECTIONS = [
  "public",
  "internal",
  "diligence",
  "restricted-security",
  "owner-private",
] as const;

export type AliceCorpusProjection =
  (typeof ALICE_CORPUS_PROJECTIONS)[number];

export const ALICE_CORPUS_VERIFY_MODES = ["selected", "full", "off"] as const;

export type AliceCorpusVerifyMode =
  (typeof ALICE_CORPUS_VERIFY_MODES)[number];

export interface AliceCorpusConfig {
  rootDir: string;
  projection: AliceCorpusProjection;
  verifyMode: AliceCorpusVerifyMode;
  strict: boolean;
  graphEnabled: boolean;
  allowOwnerPrivate: boolean;
}

function readBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

export function resolveAliceCorpusConfig(
  env: NodeJS.ProcessEnv = process.env,
): AliceCorpusConfig | null {
  const rawRoot = env.ALICE_CORPUS_ROOT?.trim();
  if (!rawRoot) return null;

  const projection = env.ALICE_CORPUS_PROJECTION?.trim();
  if (!projection) {
    throw new Error(
      "ALICE_CORPUS_PROJECTION is required when ALICE_CORPUS_ROOT is configured",
    );
  }
  if (!(ALICE_CORPUS_PROJECTIONS as readonly string[]).includes(projection)) {
    throw new Error(`Unsupported Alice corpus projection: ${projection}`);
  }

  const verifyMode = env.ALICE_CORPUS_VERIFY?.trim() || "selected";
  if (
    !(ALICE_CORPUS_VERIFY_MODES as readonly string[]).includes(verifyMode)
  ) {
    throw new Error(
      `Unsupported Alice corpus verification mode: ${verifyMode}`,
    );
  }

  const strict = readBoolean(env.ALICE_CORPUS_STRICT, true);
  const graphEnabled = readBoolean(env.ALICE_CORPUS_GRAPH_ENABLED, true);
  const allowOwnerPrivate = readBoolean(
    env.ALICE_CORPUS_ALLOW_OWNER_PRIVATE,
    false,
  );

  if (projection === "owner-private" && !allowOwnerPrivate) {
    throw new Error(
      "ALICE_CORPUS_ALLOW_OWNER_PRIVATE=1 is required for owner-private projection",
    );
  }
  if (strict && verifyMode === "off") {
    throw new Error(
      "Alice corpus verification cannot be off in strict mode",
    );
  }

  return {
    rootDir: path.resolve(rawRoot),
    projection: projection as AliceCorpusProjection,
    verifyMode: verifyMode as AliceCorpusVerifyMode,
    strict,
    graphEnabled,
    allowOwnerPrivate,
  };
}
