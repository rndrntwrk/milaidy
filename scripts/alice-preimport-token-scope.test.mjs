import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/alice-cloudflare-container-bringup.yml", import.meta.url),
  "utf8",
);
const bootstrap = fs.readFileSync(
  new URL("../deploy/modal/alice_cloudflare_bootstrap.mjs", import.meta.url),
  "utf8",
);

test("pre-import is the protected-source bounded mutation and emits the exact boundary", () => {
  assert.doesNotMatch(workflow, /refs\/heads\/ops\/alice-preimport-/);
  assert.match(
    workflow,
    /refs\/heads\/release\/alice-production-core-2026-08-22/,
  );
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$SOURCE_SHA"/);
  assert.match(
    workflow,
    /test "\$GITHUB_REF" = "refs\/heads\/release\/alice-production-core-2026-08-22"/,
  );
  assert.match(
    workflow,
    /ALICE_BOOTSTRAP_VERSION_BOUNDARY_PATH:[\s\S]*?bootstrap-version-boundary\.json/,
  );
  assert.match(workflow, /alice\.preimport-output-digests\.v2/);
  assert.match(workflow, /bootstrapVersionBoundarySha256/);
  assert.match(workflow, /durableObjectNamespaceIdsSha256/);
  assert.match(workflow, /revalidateAliceBootstrapVersionBoundaryCurrent/);
  assert.doesNotMatch(workflow, /Capture exact active Durable Object identities read-only/);
});

test("pre-import names its two non-serving mutations and forbids production authority", () => {
  assert.match(workflow, /traffic-preserving pre-import and materialization/i);
  assert.match(workflow, /Container registry import/i);
  assert.match(workflow, /inactive Access Worker-version upload/i);
  assert.match(workflow, /no Worker deployment/i);
  assert.match(workflow, /no route or\s+custom-domain mutation/i);
  assert.match(workflow, /no signature or\s+ProgramEnvelope installation/i);
  assert.match(workflow, /no public traffic change/i);
});

test("pre-import proves continuity before its first mutation and has no create path", () => {
  const continuityJob = workflow.match(
    /\n  verify_continuity_prestate:[\s\S]*?(?=\n  import_runtime:)/,
  )?.[0] ?? "";
  const importJob = workflow.match(
    /\n  import_runtime:[\s\S]*?(?=\n  materialize:)/,
  )?.[0] ?? "";
  assert.match(continuityJob, /verifyAliceBootstrapPreimportContinuity/);
  assert.match(continuityJob, /fetchAliceBootstrapResourceSnapshot/);
  assert.match(importJob, /needs:\s*verify_continuity_prestate/);

  const main = bootstrap.slice(bootstrap.indexOf("async function main()"));
  assert.match(main, /verifyAliceBootstrapPreimportContinuity\(preflightSecond\)/);
  assert.doesNotMatch(
    main,
    /ensureAliceBootstrapQueue|ensureBucketAndSentinel|ensureConsumer/,
  );
});
