#!/usr/bin/env bun
import { buildAliceCorpusKnowledgeDocuments } from "../packages/agent/src/plugins/alice-corpus/knowledge.js";
import { loadAndValidateCorpus } from "../packages/agent/src/plugins/alice-corpus/manifest.js";
import { resolveAliceCorpusConfig } from "../packages/agent/src/plugins/alice-corpus/config.js";

async function main(): Promise<void> {
  const config = resolveAliceCorpusConfig(process.env);
  if (!config) {
    throw new Error("ALICE_CORPUS_ROOT is required for corpus verification");
  }

  const corpus = await loadAndValidateCorpus(config);
  const documents = buildAliceCorpusKnowledgeDocuments(corpus);
  const fragmentCount = documents.reduce(
    (count, document) => count + document.fragments.length,
    0,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        corpusId: corpus.manifest.corpus_id,
        corpusVersion: corpus.manifest.version,
        projection: corpus.config.projection,
        verificationMode: corpus.config.verifyMode,
        inputDigest: corpus.inputDigest,
        verifiedFileCount: corpus.verifiedFiles.size,
        recordCount: corpus.records.length,
        dossierCount: corpus.dossiers.length,
        documentCount: documents.length,
        fragmentCount,
        graphNodeCount: corpus.graphNodes.length,
        graphEdgeCount: corpus.graphEdges.length,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        status: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
