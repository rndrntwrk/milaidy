import { resolveAliceCorpusConfig } from "./config.js";
import { AliceCorpusGraphIndex } from "./graph.js";
import {
  purgeAliceCorpusKnowledge,
  seedAliceCorpusKnowledge,
} from "./knowledge.js";
import { loadAndValidateCorpus } from "./manifest.js";

export interface AliceCorpusRuntimeDependencies {
  seed(runtime: unknown, documents: readonly any[]): Promise<void>;
  documentIdForKey(agentId: string, key: string): string;
  log?(event: string, payload: Record<string, unknown>): void;
}

export interface AliceCorpusRuntimeIdentity {
  corpusId: string;
  version: string;
  projection: string;
  inputDigest: string;
  verificationMode: string;
  recordCount: number;
  dossierCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
}

export interface AliceCorpusRuntimeState {
  identity: AliceCorpusRuntimeIdentity;
  graph: AliceCorpusGraphIndex | null;
  seedReport: Awaited<ReturnType<typeof seedAliceCorpusKnowledge>>;
  initializedAt: string;
}

const runtimeStates = new Map<string, AliceCorpusRuntimeState>();

export function getAliceCorpusRuntimeState(
  agentId: string,
): AliceCorpusRuntimeState | null {
  return runtimeStates.get(agentId) ?? null;
}

export function clearAliceCorpusRuntimeState(agentId?: string): void {
  if (agentId) {
    runtimeStates.delete(agentId);
    return;
  }
  runtimeStates.clear();
}

export async function initializeAliceCorpusRuntime(
  runtime: any,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: AliceCorpusRuntimeDependencies,
): Promise<AliceCorpusRuntimeState | null> {
  const agentId = String(runtime.agentId);
  const config = resolveAliceCorpusConfig(env);

  if (!config) {
    const purgeReport = await purgeAliceCorpusKnowledge(runtime);
    runtimeStates.delete(agentId);
    if (purgeReport.prunedDocuments > 0 || purgeReport.prunedFragments > 0) {
      dependencies.log?.("alice-corpus-purged", {
        prunedDocuments: purgeReport.prunedDocuments,
        prunedFragments: purgeReport.prunedFragments,
      });
    }
    return null;
  }

  try {
    const startedAt = Date.now();
    const corpus = await loadAndValidateCorpus(config);
    const seedReport = await seedAliceCorpusKnowledge(
      runtime,
      corpus,
      dependencies,
    );
    const graph = config.graphEnabled
      ? new AliceCorpusGraphIndex(corpus.graphNodes, corpus.graphEdges, {
          version: corpus.manifest.version,
          projection: config.projection,
        })
      : null;
    const identity: AliceCorpusRuntimeIdentity = {
      corpusId: corpus.manifest.corpus_id,
      version: corpus.manifest.version,
      projection: config.projection,
      inputDigest: corpus.inputDigest,
      verificationMode: config.verifyMode,
      recordCount: corpus.records.length,
      dossierCount: corpus.dossiers.length,
      graphNodeCount: corpus.graphNodes.length,
      graphEdgeCount: corpus.graphEdges.length,
    };
    const state: AliceCorpusRuntimeState = {
      identity,
      graph,
      seedReport,
      initializedAt: new Date().toISOString(),
    };
    runtimeStates.set(agentId, state);

    dependencies.log?.("alice-corpus-ready", {
      corpusId: identity.corpusId,
      corpusVersion: identity.version,
      projection: identity.projection,
      inputDigest: identity.inputDigest,
      verificationMode: identity.verificationMode,
      recordCount: identity.recordCount,
      dossierCount: identity.dossierCount,
      documentCount: seedReport.documentCount,
      fragmentCount: seedReport.fragmentCount,
      prunedDocuments: seedReport.prunedDocuments,
      prunedFragments: seedReport.prunedFragments,
      graphNodeCount: identity.graphNodeCount,
      graphEdgeCount: identity.graphEdgeCount,
      elapsedMs: Date.now() - startedAt,
    });
    return state;
  } catch (error) {
    runtimeStates.delete(agentId);
    if (config.strict) throw error;
    dependencies.log?.("alice-corpus-disabled", {
      projection: config.projection,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
