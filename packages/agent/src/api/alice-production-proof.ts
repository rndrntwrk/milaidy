import { isAliceFullRuntimeProfile } from "../runtime/alice-runtime-profile.js";
import { readAliceReleaseMetadata } from "./alice-release-metadata.js";

type EnvironmentLike = Record<string, string | undefined>;
type RuntimeLike = {
  plugins?: unknown[];
  actions?: unknown[];
  evaluators?: unknown[];
  services?: unknown;
};

const BOUNDARY = Symbol.for("rndrntwrk.alice.production-boundary.v1");
const EXACT_CONFIGURED_PLUGINS = [
  "alice-production-response-only",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-openai",
] as const;
const FULL_REQUIRED_CONFIGURED_PLUGINS = [
  "eliza",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-openai",
] as const;
const FULL_REQUIRED_RUNTIME_PLUGINS = [
  "@elizaos/plugin-agent-skills",
  "basic-capabilities",
  "core-security-hooks",
  "eliza",
  "openai",
  "sql",
] as const;
const FULL_CORE_COMPOSITION = [
  "bridge:eliza",
  "capabilities:basic",
  "security:core-hooks",
  "memory:sql",
  "skills:agent-skills",
  "hooks:eliza",
  "connectors:eliza",
] as const;

type BoundaryStamp = {
  schemaVersion: "alice.runtime-boundary-stamp.v1";
  configuredPluginPackages: string[];
  actionPlanning: false;
  backgroundAuthorityWorkers: "absent";
  observedServiceTypes: string[];
};

type FullRuntimeBoundaryStamp = {
  schemaVersion: "alice.full-runtime-boundary-stamp.v1";
  requiredConfiguredPluginPackages: string[];
  requiredRuntimePluginNames: string[];
  coreComposition: string[];
  actionPlanning: true;
  bridgePlugin: "eliza";
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

function configuredInventory(entries: string[]): string[] {
  if (
    entries.length < 1 ||
    entries.length > 64 ||
    new Set(entries).size !== entries.length ||
    entries.some(
      (name) =>
        typeof name !== "string" ||
        name.length < 1 ||
        name.length > 128 ||
        !/^[a-zA-Z0-9@/._:-]+$/.test(name),
    )
  ) {
    throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
  }
  return [...entries];
}

function registryKeys(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (value instanceof Map) {
    const keys = [...value.keys()].map(String);
    if (
      keys.length > 64 ||
      keys.some((key) => !/^[a-zA-Z0-9@/._:-]{1,128}$/.test(key))
    ) {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    return [...new Set(keys)].sort();
  }
  if (Array.isArray(value)) return inventory(value);
  throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
}

function taskWorkerNames(runtime: RuntimeLike): string[] {
  const registries = runtime as unknown as {
    taskWorkers?: unknown;
    taskWorkerRegistry?: unknown;
  };
  return [
    ...new Set([
      ...registryKeys(registries.taskWorkers),
      ...registryKeys(registries.taskWorkerRegistry),
    ]),
  ].sort();
}

function hasNoDeclaredExecutionSurface(plugin: object): boolean {
  const record = plugin as Record<string, unknown>;
  const arrayFields = [
    "actions",
    "providers",
    "evaluators",
    "services",
    "routes",
  ] as const;
  if (
    arrayFields.some(
      (field) =>
        record[field] !== undefined &&
        (!Array.isArray(record[field]) || record[field].length !== 0),
    )
  ) {
    return false;
  }
  const events = record.events;
  if (events === undefined) return true;
  if (events === null || typeof events !== "object" || Array.isArray(events)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(events);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(events).length === 0
  );
}

function exactRuntimePluginClosure(plugins: unknown[] | undefined): boolean {
  if (!Array.isArray(plugins)) return false;
  const names = inventory(plugins);
  const sql = names.filter(
    (name) => name === "sql" || name === "@elizaos/plugin-sql",
  );
  const openai = names.filter(
    (name) => name === "openai" || name === "@elizaos/plugin-openai",
  );
  return (
    plugins.length === 5 &&
    names.length === 5 &&
    names.includes("alice-production-response-only") &&
    names.includes("basic-capabilities") &&
    names.includes("core-security-hooks") &&
    sql.length === 1 &&
    openai.length === 1 &&
    plugins.every((plugin) => hasNoDeclaredExecutionSurface(plugin as object))
  );
}

export function stampAliceProductionRuntimeBoundary(
  runtime: RuntimeLike,
  configuredPluginPackages: string[],
  environment: EnvironmentLike = process.env,
): void {
  if (isAliceFullRuntimeProfile(environment)) {
    const configured = configuredInventory(configuredPluginPackages);
    const runtimePluginNames = inventory(runtime.plugins);
    if (
      configured[0] !== "eliza" ||
      configured.includes("alice-production-response-only") ||
      !FULL_REQUIRED_CONFIGURED_PLUGINS.every((name) =>
        configured.includes(name),
      ) ||
      !FULL_REQUIRED_RUNTIME_PLUGINS.every((name) =>
        runtimePluginNames.includes(name),
      ) ||
      runtimePluginNames.includes("alice-production-response-only") ||
      inventory(runtime.actions).length === 0
    ) {
      throw new Error("ALICE_PRODUCTION_EXECUTION_SURFACE_INVALID");
    }
    const stamp: FullRuntimeBoundaryStamp = Object.freeze({
      schemaVersion: "alice.full-runtime-boundary-stamp.v1",
      requiredConfiguredPluginPackages: Object.freeze([
        ...FULL_REQUIRED_CONFIGURED_PLUGINS,
      ]) as unknown as string[],
      requiredRuntimePluginNames: Object.freeze([
        ...FULL_REQUIRED_RUNTIME_PLUGINS,
      ]) as unknown as string[],
      coreComposition: Object.freeze([
        ...FULL_CORE_COMPOSITION,
      ]) as unknown as string[],
      actionPlanning: true,
      bridgePlugin: "eliza",
    });
    Object.defineProperty(runtime, BOUNDARY, {
      value: stamp,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return;
  }

  if (!exactStrings(configuredPluginPackages, EXACT_CONFIGURED_PLUGINS)) {
    throw new Error("ALICE_PRODUCTION_PLUGIN_CLOSURE_INVALID");
  }
  const actionNames = inventory(runtime.actions);
  const evaluatorNames = inventory(runtime.evaluators);
  const workers = taskWorkerNames(runtime);
  const serviceTypes = registryKeys(runtime.services);
  if (
    !exactRuntimePluginClosure(runtime.plugins) ||
    actionNames.length > 0 ||
    evaluatorNames.length > 0 ||
    serviceTypes.length > 0 ||
    workers.length > 0
  ) {
    throw new Error("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
  }
  const stamp: BoundaryStamp = Object.freeze({
    schemaVersion: "alice.runtime-boundary-stamp.v1",
    configuredPluginPackages: Object.freeze([
      ...configuredPluginPackages,
    ]) as unknown as string[],
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
  const stamp = (runtime as RuntimeLike & Record<symbol, unknown>)[BOUNDARY] as
    | BoundaryStamp
    | FullRuntimeBoundaryStamp
    | undefined;
  const release = readAliceReleaseMetadata(environment);
  if (isAliceFullRuntimeProfile(environment)) {
    if (
      stamp?.schemaVersion !== "alice.full-runtime-boundary-stamp.v1" ||
      stamp.actionPlanning !== true ||
      stamp.bridgePlugin !== "eliza" ||
      !release
    ) {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    const runtimePluginNames = inventory(runtime.plugins);
    if (
      !FULL_REQUIRED_RUNTIME_PLUGINS.every((name) =>
        runtimePluginNames.includes(name),
      ) ||
      runtimePluginNames.includes("alice-production-response-only") ||
      inventory(runtime.actions).length === 0
    ) {
      throw new Error("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
    }
    return {
      schemaVersion: "alice.full-runtime-boundary-proof.v1" as const,
      authorityMode: "proposer-only" as const,
      runtimeProfile: "full-gated" as const,
      bridgePlugin: "eliza" as const,
      actionPlanning: true as const,
      coreComposition: [...stamp.coreComposition],
      requiredConfiguredPluginPackages: [
        ...stamp.requiredConfiguredPluginPackages,
      ],
      requiredRuntimePluginNames: [...stamp.requiredRuntimePluginNames],
      release,
    };
  }

  if (
    environment.ALICE_RUNTIME_AUTHORITY_MODE !== "proposer-only" ||
    !stamp ||
    stamp.schemaVersion !== "alice.runtime-boundary-stamp.v1" ||
    !exactStrings(stamp.configuredPluginPackages, EXACT_CONFIGURED_PLUGINS) ||
    stamp.actionPlanning !== false ||
    stamp.backgroundAuthorityWorkers !== "absent" ||
    !exactStrings(registryKeys(runtime.services), stamp.observedServiceTypes) ||
    !exactRuntimePluginClosure(runtime.plugins) ||
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
