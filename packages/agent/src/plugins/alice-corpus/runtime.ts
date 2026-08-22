import { resolveAliceCorpusConfig } from "./config.js";
import { AliceCorpusGraphIndex } from "./graph.js";
import { seedAliceCorpusKnowledge } from "./knowledge.js";
import { loadAndValidateCorpus } from "./manifest.js";

export interface AliceCorpusRuntimeDependencies {
  seed(runtime: unknown, documents: readonly any[]): Promise<void>;
  documentIdForKey(agentId: string, key: string): string;
  log?(event: string, payload: Record<string, unknown>): void;
}

export interface AliceCorpusRuntimeState {
  corpus: Awaited<ReturnType<typeof loadAndValidateCorpus>>;
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

export function clearAliceCorpusRuntimeState(): void {
  runtimeStates.clear();
}

export async function initializeAliceCorpusRuntime(
  runtime: any,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: AliceCorpusRuntimeDependencies,
): Promise<AliceCorpusRuntimeState | null> {
  const config = resolveAliceCorpusConfig(env);
  if (!config) return null;

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
    const state: AliceCorpusRuntimeState = {
      corpus,
      graph,
      seedReport,
      initializedAt: new Date().toISOString(),
    };
    runtimeStates.set(String(runtime.agentId), state);

    dependencies.log?.("alice-corpus-ready", {
      corpusVersion: corpus.manifest.version,
      projection: config.projection,
      inputDigest: corpus.inputDigest,
      verificationMode: config.verifyMode,
      recordCount: corpus.records.length,
      dossierCount: corpus.dossiers.length,
      documentCount: seedReport.documentCount,
      fragmentCount: seedReport.fragmentCount,
      prunedDocuments: seedReport.prunedDocuments,
      prunedFragments: seedReport.prunedFragments,
      graphNodeCount: corpus.graphNodes.length,
      graphEdgeCount: corpus.graphEdges.length,
      elapsedMs: Date.now() - startedAt,
    });
    return state;
  } catch (error) {
    runtimeStates.delete(String(runtime.agentId));
    if (config.strict) throw error;
    dependencies.log?.("alice-corpus-disabled", {
      projection: config.projection,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
