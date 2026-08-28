import crypto from "node:crypto";
import fs from "node:fs";

import { isAliceFullRuntimeProfile } from "./alice-runtime-profile.js";

export type AliceCapabilityClassification =
  | "core"
  | "delegated"
  | "platform-incompatible"
  | "policy-disabled";

export type AliceCapabilityBomEntry = {
  id: string;
  classification: AliceCapabilityClassification;
  identity: string;
  surface?: "plugin" | "module" | "internal" | "adapter" | "platform";
  runtimeNames: string[];
  installed: boolean;
  implementationCallable: boolean;
  adapter: string | null;
  policyState: "enabled" | "disabled" | "delegated" | "unavailable";
  files: Array<{ path: string; sha256: string; size: number }>;
  packageSha256: string | null;
  entrypointSha256: string | null;
  replacedPackages?: string[];
};

export type AliceCapabilityBom = {
  schemaVersion: "alice.capability-bom.v1";
  entries: AliceCapabilityBomEntry[];
};

type EnvironmentLike = Record<string, string | undefined>;
type RuntimePluginLike = { name?: unknown };

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export const aliceDelegatedCapabilityAdapters = Object.freeze({
  cloudflareWorkflows: Object.freeze({
    id: "cloudflare-workflows",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  remoteModelExecution: Object.freeze({
    id: "remote-model-execution",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  remoteTraining: Object.freeze({
    id: "remote-training",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  streamCompositor: Object.freeze({
    id: "stream-compositor",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  cloudflareBrowserRendering: Object.freeze({
    id: "cloudflare-browser-rendering",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  cloudflareSandbox: Object.freeze({
    id: "cloudflare-sandbox",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  modalBurst: Object.freeze({
    id: "modal-burst",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  macosNativeExecutor: Object.freeze({
    id: "macos-native-executor",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
  codexSubscriptionExecutor: Object.freeze({
    id: "codex-subscription-executor",
    authenticated: true,
    schemaVersion: "alice.delegated-adapter.v1",
  }),
});

export const aliceInternalCapabilityDescriptors = Object.freeze({
  fullRuntime: Object.freeze({
    id: "alice-full-runtime",
    callable: true,
    schemaVersion: "alice.internal-capability.v1",
  }),
  fullUi: Object.freeze({
    id: "alice-full-ui",
    callable: true,
    schemaVersion: "alice.internal-capability.v1",
  }),
  knowledge: Object.freeze({
    id: "alice-knowledge-runtime",
    callable: true,
    schemaVersion: "alice.internal-capability.v1",
  }),
  taskCoordinator: Object.freeze({
    id: "alice-task-coordinator",
    callable: true,
    schemaVersion: "alice.internal-capability.v1",
  }),
});

export const aliceFullRuntimeCapability = aliceInternalCapabilityDescriptors.fullRuntime;
export const aliceFullUiCapability = aliceInternalCapabilityDescriptors.fullUi;
export const aliceKnowledgeRuntimeCapability = aliceInternalCapabilityDescriptors.knowledge;
export const aliceTaskCoordinatorCapability =
  aliceInternalCapabilityDescriptors.taskCoordinator;
export const cloudflareWorkflowsAdapter =
  aliceDelegatedCapabilityAdapters.cloudflareWorkflows;
export const remoteModelExecutionAdapter =
  aliceDelegatedCapabilityAdapters.remoteModelExecution;
export const remoteTrainingAdapter =
  aliceDelegatedCapabilityAdapters.remoteTraining;
export const streamCompositorAdapter =
  aliceDelegatedCapabilityAdapters.streamCompositor;
export const cloudflareBrowserRenderingAdapter =
  aliceDelegatedCapabilityAdapters.cloudflareBrowserRendering;
export const cloudflareSandboxAdapter =
  aliceDelegatedCapabilityAdapters.cloudflareSandbox;
export const modalBurstAdapter =
  aliceDelegatedCapabilityAdapters.modalBurst;
export const macosNativeExecutorAdapter =
  aliceDelegatedCapabilityAdapters.macosNativeExecutor;
export const codexSubscriptionExecutorAdapter =
  aliceDelegatedCapabilityAdapters.codexSubscriptionExecutor;

export function assertAliceFullGatedCapabilityEnvironment(
  environment: EnvironmentLike = process.env,
): void {
  if (
    isAliceFullRuntimeProfile(environment) &&
    (environment.ELIZA_SKIP_PLUGINS ?? "").trim().length > 0
  ) {
    throw new Error("ALICE_FULL_GATED_SKIP_PLUGINS_FORBIDDEN");
  }
}

function packageName(entry: AliceCapabilityBomEntry): string | null {
  if (!entry.id.startsWith("package:")) return null;
  return entry.id.slice("package:".length);
}

export function enforceAliceFullGatedCapabilityPolicy(
  pluginPackages: Set<string>,
  bom: AliceCapabilityBom,
): string[] {
  const removed: string[] = [];
  for (const entry of bom.entries) {
    if (entry.classification === "policy-disabled") {
      const name = packageName(entry);
      if (name && pluginPackages.delete(name)) removed.push(name);
    }
    if (
      entry.classification === "delegated" ||
      entry.classification === "platform-incompatible"
    ) {
      for (const name of entry.replacedPackages ?? []) {
        if (pluginPackages.delete(name)) removed.push(name);
      }
    }
  }
  return removed.sort();
}

function runtimePluginNames(runtimePlugins: RuntimePluginLike[]): Set<string> {
  const names = new Set<string>();
  for (const plugin of runtimePlugins) {
    if (
      !plugin ||
      typeof plugin.name !== "string" ||
      !/^[a-zA-Z0-9@/._:-]{1,128}$/.test(plugin.name)
    ) {
      throw new Error("ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH");
    }
    names.add(plugin.name);
  }
  return names;
}

export function buildAliceRuntimeCapabilityState(
  bom: AliceCapabilityBom,
  runtimePlugins: RuntimePluginLike[],
) {
  if (bom.schemaVersion !== "alice.capability-bom.v1" || !Array.isArray(bom.entries)) {
    throw new Error("ALICE_CAPABILITY_BOM_INVALID");
  }
  const loadedNames = runtimePluginNames(runtimePlugins);
  const counts: Record<AliceCapabilityClassification, number> = {
    core: 0,
    delegated: 0,
    "platform-incompatible": 0,
    "policy-disabled": 0,
  };
  const entries = bom.entries.map((entry) => {
    counts[entry.classification] += 1;
    const loaded =
      (entry.surface === "module" || entry.id.startsWith("internal:")) &&
      entry.runtimeNames.length === 0
        ? entry.installed && entry.implementationCallable
        : entry.runtimeNames.some((name) => loadedNames.has(name));
    if (entry.classification === "core" && (!loaded || !entry.implementationCallable)) {
      throw new Error("ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH");
    }
    if (entry.classification === "policy-disabled" && loaded) {
      throw new Error("ALICE_CAPABILITY_POLICY_DISABLED");
    }
    return {
      id: entry.id,
      classification: entry.classification,
      identity: entry.identity,
      installed: entry.installed,
      loaded,
      callable: entry.classification === "core" && loaded && entry.implementationCallable,
      adapter: entry.adapter,
      policyState: entry.policyState,
    };
  });
  return { counts, entries };
}

export function readAliceCapabilityBom(
  environment: EnvironmentLike = process.env,
  bomPath = environment.ALICE_CAPABILITY_BOM_PATH || "/app/alice-capability-bom.json",
): { bom: AliceCapabilityBom; bomSha256: string } {
  const expectedDigest = environment.ALICE_CAPABILITY_BOM_SHA256;
  if (!expectedDigest || !DIGEST.test(expectedDigest)) {
    throw new Error("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
  }
  const bytes = fs.readFileSync(bomPath);
  const actualDigest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
  if (actualDigest !== expectedDigest) {
    throw new Error("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
  }
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    throw new Error("ALICE_CAPABILITY_BOM_INVALID");
  }
  const bom = JSON.parse(text) as AliceCapabilityBom;
  if (bom.schemaVersion !== "alice.capability-bom.v1" || !Array.isArray(bom.entries)) {
    throw new Error("ALICE_CAPABILITY_BOM_INVALID");
  }
  return { bom, bomSha256: actualDigest };
}
