import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/alice-cloudflare-container-bringup.yml", import.meta.url),
  "utf8",
);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function captureProviderReadScript() {
  const captureStep = workflow.match(
    /- name: Capture exact active Durable Object identities read-only[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  const inlineScript = captureStep.match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/,
  )?.[1];
  assert.ok(inlineScript, "the exact provider-read script must be extractable");
  return inlineScript;
}

function runProviderReadScript(mode) {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "alice-preimport-provider-read-"),
  );
  const countPath = path.join(tempDirectory, "fetch-count.txt");
  const outputPath = path.join(tempDirectory, "namespace-ids.json");
  const preludePath = path.join(tempDirectory, "provider-read-prelude.mjs");
  fs.writeFileSync(
    preludePath,
    `import fs from "node:fs";
let fetchCount = 0;
process.on("exit", () => fs.writeFileSync(process.env.ALICE_TEST_FETCH_COUNT_PATH, String(fetchCount)));
globalThis.fetch = async () => {
  fetchCount += 1;
  const mode = process.env.ALICE_TEST_PROVIDER_RESPONSE;
  if (mode === "malformed-json-503") {
    return new Response("not-json", { status: 503 });
  }
  if (mode === "schema-invalid-503") {
    return new Response(JSON.stringify({}), { status: 503 });
  }
  if (mode === "cloudflare-no-code-503") {
    return new Response(JSON.stringify({ success: false, errors: [], messages: [], result: null }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  if (mode === "cloudflare-coded-503") {
    return new Response(JSON.stringify({
      success: false,
      errors: [{ code: 1000, message: "redacted-by-test" }],
      messages: [],
      result: null,
    }), { status: 503, headers: { "content-type": "application/json" } });
  }
  throw new Error("unexpected fixture mode");
};
`,
    { encoding: "utf8", mode: 0o600 },
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        preludePath,
        "--input-type=module",
        "--eval",
        captureProviderReadScript(),
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH: outputPath,
          ALICE_TEST_FETCH_COUNT_PATH: countPath,
          ALICE_TEST_PROVIDER_RESPONSE: mode,
          CLOUDFLARE_ACCOUNT_ID: "036df6c823669b8fa2f66cf4c16eeb29",
          CLOUDFLARE_API_TOKEN: "test-only-token-never-log",
        },
        timeout: 5_000,
      },
    );
    return {
      ...result,
      fetchCount: Number.parseInt(fs.readFileSync(countPath, "utf8"), 10),
    };
  } finally {
    fs.rmSync(tempDirectory, { force: true, recursive: true });
  }
}

test("pre-import checks Workers Scripts read scope before provider snapshot", () => {
  assert.match(
    workflow,
    /name: Verify Cloudflare deployment-token read scope before provider reads/,
  );
  assert.match(
    workflow,
    /ALICE_CLOUDFLARE_DEPLOY_TOKEN_SCOPE_INVALID/,
  );
  assert.match(
    workflow,
    /workers\/scripts\?per_page=1/,
  );
  assert.match(workflow, /cloudflare_code/);
  assert.match(
    workflow,
    /Capture exact active Durable Object identities read-only/,
  );
});

test("pre-import Durable Object reads expose sanitized failures and retry only transient 503s", () => {
  const captureStep = workflow.match(
    /- name: Capture exact active Durable Object identities read-only[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";

  assert.match(captureStep, /const TRANSIENT_READ_ATTEMPTS = 3;/);
  assert.match(captureStep, /const TRANSIENT_READ_DELAY_MS = 250;/);
  assert.match(captureStep, /async function get\(operation, pathname\)/);
  assert.match(
    captureStep,
    /ALICE_PREIMPORT_PROVIDER_READ_INVALID:\$\{operation\}:HTTP_\$\{httpStatus\}:CF_\$\{code \?\? "NONE"\}/,
  );
  assert.match(
    captureStep,
    /response\.status === 503[\s\S]*?isCloudflareErrorEnvelope\(payload\)[\s\S]*?providerErrorCode\(payload\) === undefined[\s\S]*?attempt < TRANSIENT_READ_ATTEMPTS/,
  );
  assert.match(captureStep, /payload\.success === false/);
  assert.match(captureStep, /Object\.hasOwn\(payload, "result"\)/);
  assert.match(
    captureStep,
    /await sleep\(TRANSIENT_READ_DELAY_MS\)/,
  );
  assert.match(captureStep, /get\(\s*"VERIFY_READ_TOKEN",/);
  assert.match(captureStep, /`GET_\$\{role\.replace\(\/\(\[A-Z\]\)\/g, "_\$1"\)\.toUpperCase\(\)\}_DEPLOYMENTS`/);
  assert.match(captureStep, /`GET_\$\{role\.replace\(\/\(\[A-Z\]\)\/g, "_\$1"\)\.toUpperCase\(\)\}_VERSION`/);
  assert.doesNotMatch(captureStep, /console\.(?:log|error)\([^)]*(?:payload|token|response)/);
});

test("provider reads fail immediately on malformed or schema-invalid 503 envelopes", () => {
  for (const mode of ["malformed-json-503", "schema-invalid-503"]) {
    const result = runProviderReadScript(mode);
    assert.notEqual(result.status, 0, `${mode} must fail closed`);
    assert.equal(result.fetchCount, 1, `${mode} must not be retried`);
    assert.match(
      result.stderr,
      /ALICE_PREIMPORT_PROVIDER_READ_INVALID:VERIFY_READ_TOKEN:HTTP_503:CF_NONE/,
    );
    assert.doesNotMatch(result.stderr, /test-only-token-never-log|not-json/);
  }
});

test("provider reads retry only a valid Cloudflare 503 envelope without a numeric code", () => {
  const transient = runProviderReadScript("cloudflare-no-code-503");
  assert.notEqual(transient.status, 0);
  assert.equal(transient.fetchCount, 3);
  assert.match(
    transient.stderr,
    /ALICE_PREIMPORT_PROVIDER_READ_INVALID:VERIFY_READ_TOKEN:HTTP_503:CF_NONE/,
  );

  const explicitProviderError = runProviderReadScript("cloudflare-coded-503");
  assert.notEqual(explicitProviderError.status, 0);
  assert.equal(explicitProviderError.fetchCount, 1);
  assert.match(
    explicitProviderError.stderr,
    /ALICE_PREIMPORT_PROVIDER_READ_INVALID:VERIFY_READ_TOKEN:HTTP_503:CF_1000/,
  );
  assert.doesNotMatch(explicitProviderError.stderr, /redacted-by-test|test-only-token-never-log/);
});

test("pre-import isolates provider reads from the deployment write token", () => {
  assert.match(
    workflow,
    /`\/accounts\/\$\{accountId\}\/tokens\/verify`/,
    "the persistent account-owned Alice token must use the account-token verification endpoint",
  );
  assert.doesNotMatch(
    workflow,
    /get\("\/user\/tokens\/verify"\)/,
    "the account-owned Alice token must not be sent to the user-token verification endpoint",
  );
  const readTokenBinding =
    "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_READ_TOKEN }}";
  assert.equal(
    workflow.split(readTokenBinding).length - 1,
    3,
    "the scope preflight, Durable Object capture, and materializer must use the dedicated read token",
  );
});

test("pre-import validation cannot fail valid values through pipefail SIGPIPE", () => {
  const workflowLines = workflow.split("\n");
  const unsafePipefailValidations = workflowLines.filter((line, index) =>
    line.includes("printf '%s'") &&
    (
      line.includes("| grep -Eq") ||
      (line.trimEnd().endsWith("| \\") &&
        workflowLines[index + 1]?.includes("grep -Eq"))
    )
  );
  assert.equal(
    unsafePipefailValidations.length,
    0,
    "validation must pass values to grep without a pipe under set -o pipefail",
  );
});
