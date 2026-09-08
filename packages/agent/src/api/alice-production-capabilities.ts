import {
  type AliceCapabilityBom,
  buildAliceRuntimeCapabilityState,
} from "../runtime/alice-capability-inventory.js";
import { readAliceReleaseMetadata } from "./alice-release-metadata.js";

type EnvironmentLike = Record<string, string | undefined>;

export function buildAliceProductionCapabilities(input: {
  bom: AliceCapabilityBom;
  bomSha256: string;
  environment: EnvironmentLike;
  runtimePlugins: Array<{ name?: unknown }>;
  documentsService?: unknown;
}) {
  const release = readAliceReleaseMetadata(input.environment);
  if (!release || release.capabilityBomSha256 !== input.bomSha256) {
    throw new Error("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
  }
  const documents = input.documentsService as
    | { addDocument?: unknown; searchDocuments?: unknown }
    | null
    | undefined;
  if (
    input.bom.entries.some(
      (entry) => entry.id === "internal:alice-knowledge-runtime",
    ) &&
    (typeof documents?.addDocument !== "function" ||
      typeof documents?.searchDocuments !== "function")
  ) {
    throw new Error("ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH");
  }
  const runtime = buildAliceRuntimeCapabilityState(input.bom, input.runtimePlugins);
  return {
    schemaVersion: "alice.production-capabilities.v1" as const,
    capabilityBomSha256: input.bomSha256,
    counts: runtime.counts,
    release,
    entries: runtime.entries,
  };
}
