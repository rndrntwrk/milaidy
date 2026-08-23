import { readAliceReleaseMetadata } from "./alice-release-metadata.js";

type EnvironmentLike = Record<string, string | undefined>;
type RuntimeLike = {
  plugins?: unknown[];
  actions?: unknown[];
  evaluators?: unknown[];
  services?: unknown;
  taskWorkers?: unknown;
  taskWorkerRegistry?: unknown;
  [key: symbol]: unknown;
};

const BOUNDARY = Symbol.for("rndrntwrk.alice.production-boundary.v1");
const EXACT_CONFIGURED_PLUGINS = [
  "alice-production-response-only",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-openai",
] as const;

type BoundaryStamp = {
  schemaVersion: "alice.runtime-boundary-stamp.v1";
  configuredPluginPackages: string[];
  actionPlanning: false;
  backgroundAuthorityWorkers: "absent";
  observedServiceTypes: string[];
};

function exactStrings(actual: string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function inventory(entries: unknown[] | undefined): string[] {
  if (!Array.isArray(entries) || entries.length > 64) {
    throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
  }
  const names = entries.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    const name = (entry as { name?: unknown }).name;
    if (
      typeof name !== "string" ||
      name.length < 1 ||
      name.length > 128 ||
      !/^[a-zA-Z0-9@/._:-]+$/.test(name)
    ) {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    return name;
  });
  return [...new Set(names)].sort();
}

function registryKeys(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (value instanceof Map) {
    const keys = [...value.keys()].map(String);
    if (keys.length > 64 || keys.some((key) => !/^[a-zA-Z0-9@/._:-]{1,128}$/.test(key))) {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    return [...new Set(keys)].sort();
  }
  if (Array.isArray(value)) return inventory(value);
  throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
}

function taskWorkerNames(runtime: RuntimeLike): string[] {
  return [...new Set([
    ...registryKeys(runtime.taskWorkers),
    ...registryKeys(runtime.taskWorkerRegistry),
  ])].sort();
}

function exactRuntimePluginClosure(names: string[]): boolean {
  const sql = names.filter((name) => name === "sql" || name === "@elizaos/plugin-sql");
  const openai = names.filter(
    (name) => name === "openai" || name === "@elizaos/plugin-openai",
  );
  return (
    names.length === 3 &&
    names.includes("alice-production-response-only") &&
    sql.length === 1 &&
    openai.length === 1
  );
}

export function stampAliceProductionRuntimeBoundary(
  runtime: RuntimeLike,
  configuredPluginPackages: string[],
): void {
  if (!exactStrings(configuredPluginPackages, EXACT_CONFIGURED_PLUGINS)) {
    throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
  }
  const actionNames = inventory(runtime.actions);
  const evaluatorNames = inventory(runtime.evaluators);
  const pluginNames = inventory(runtime.plugins);
  const workers = taskWorkerNames(runtime);
  const serviceTypes = registryKeys(runtime.services);
  if (
    !exactRuntimePluginClosure(pluginNames) ||
    actionNames.length > 0 ||
    evaluatorNames.length > 0 ||
    serviceTypes.length > 0 ||
    workers.length > 0
  ) {
    throw new Error("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
  }
  const stamp: BoundaryStamp = Object.freeze({
    schemaVersion: "alice.runtime-boundary-stamp.v1",
    configuredPluginPackages: Object.freeze([...configuredPluginPackages]) as unknown as string[],
    actionPlanning: false,
    backgroundAuthorityWorkers: "absent",
    observedServiceTypes: Object.freeze([]) as unknown as string[],
  });
  Object.defineProperty(runtime, BOUNDARY, {
    value: stamp,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export function buildAliceProductionProof(
  runtime: RuntimeLike,
  environment: EnvironmentLike,
) {
  const stamp = runtime[BOUNDARY] as BoundaryStamp | undefined;
  const release = readAliceReleaseMetadata(environment);
  if (
    environment.ALICE_RUNTIME_AUTHORITY_MODE !== "proposer-only" ||
    !stamp ||
    stamp.schemaVersion !== "alice.runtime-boundary-stamp.v1" ||
    !exactStrings(stamp.configuredPluginPackages, EXACT_CONFIGURED_PLUGINS) ||
    stamp.actionPlanning !== false ||
    stamp.backgroundAuthorityWorkers !== "absent" ||
    !exactStrings(registryKeys(runtime.services), stamp.observedServiceTypes) ||
    !exactRuntimePluginClosure(inventory(runtime.plugins)) ||
    inventory(runtime.actions).length !== 0 ||
    inventory(runtime.evaluators).length !== 0 ||
    taskWorkerNames(runtime).length !== 0 ||
    !release
  ) {
    throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
  }
  return {
    schemaVersion: "alice.runtime-boundary-proof.v1" as const,
    authorityMode: "proposer-only" as const,
    actionExecution: "disabled" as const,
    actionPlanning: false as const,
    backgroundAuthorityWorkers: "absent" as const,
    configuredPluginPackages: [...stamp.configuredPluginPackages],
    runtimePluginNames: inventory(runtime.plugins),
    actionNames: [] as string[],
    evaluatorNames: [] as string[],
    serviceTypes: [...stamp.observedServiceTypes],
    taskWorkerNames: [] as string[],
    release,
  };
}
