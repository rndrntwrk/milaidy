import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temp = process.env.RUNNER_TEMP ?? os.tmpdir();
const oldRoot = path.join(temp, "alice-v4-control-old-source");
const evidenceRoot = path.join(temp, "alice-recovery-evidence");
const configPath = path.join(temp, "alice-v4-control-wrangler.jsonc");
const anchorPath = path.join(evidenceRoot, "rollback-anchor.json");
const account = "036df6c823669b8fa2f66cf4c16eeb29";
const zone = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const baseCommit = "a3a8a46c1216f029269866735d7d258860536474";
const priorVersion = "52b44278-383b-4ec4-990b-9d1ee3c264ec";
const pausedReaderVersion = "0a91f516-c35e-478b-8c0e-fa01cac0be57";
const recoveryVersion = "e87d5675-0393-4386-bb93-1f3542f04b27";
const oldManifest = "sha256:b916de03b84b6393946ee4bdff658ad902ad34c4205ce8e0ed8976e04a5f9eab";
const oldProgram = "sha256:dab631ede0d809f55e127d39d740a0c9ad37474e372a6e42ea03a54b8e940e67";
const oldRelease = "sha256:3d8000bd3084751e8338cb2735510645d013279a08b9f7ce0183d3e710640346";
const anchorSha256 = "ee568a71093a365eaa0c28b847c5e4df39ad9486477b8e89199ba299bf1aee77";
const retainedSecret = "ALICE_CODING_PUBLISH_TOKEN";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"], ...options,
    });
  } catch {
    throw new Error(`ALICE_RECOVERY_COMMAND_FAILED_${command}_${args[0]}`);
  }
}
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function fail(code) { throw new Error(code); }
function exact(left, right) {
  assert.deepEqual(left, right);
}
function anchor() {
  assert.equal(sha256(fs.readFileSync(anchorPath)), anchorSha256);
  const value = JSON.parse(fs.readFileSync(anchorPath, "utf8"));
  assert.equal(value.accountId, account);
  assert.equal(value.candidate.sourceCommit, "c60da065460ce29602475e8fd4a2859b629a1919");
  assert.equal(value.previous.coherent, true);
  assert.equal(value.previous.workers.control.serving.versionId, priorVersion);
  assert.equal(value.previous.containerApplication.target.configuration.image,
    `registry.cloudflare.com/${account}/alice-runtime@sha256:cbef135c612266005fcdbc89eed9a3bad93d74715acb035e3307d9ee6795a2f9`);
  return value.previous;
}
function varsAndSecrets(previous) {
  const bindings = previous.workers.control.versionResources.bindings;
  const vars = Object.fromEntries(bindings.filter(item => item.type === "plain_text")
    .map(item => [item.name, item.text]));
  const secrets = bindings.filter(item => item.type === "secret_text")
    .map(item => item.name).sort();
  assert.equal(vars.ALICE_DEPLOYMENT_MANIFEST_SHA256, oldManifest);
  assert.equal(vars.ALICE_RUNTIME_REVISION, "61");
  assert.equal(secrets.length, 7);
  return { vars, secrets };
}
function hashObject(file) {
  return run("git", ["hash-object", file], { cwd: oldRoot }).trim();
}
function prepare() {
  const previous = anchor();
  if (fs.existsSync(oldRoot)) fail("ALICE_RECOVERY_OLD_SOURCE_ALREADY_EXISTS");
  run("git", ["worktree", "add", "--detach", oldRoot, baseCommit], { cwd: root });
  const authority = "workers/alice-production-control/src/authority.ts";
  const test = "workers/alice-production-control/test/authority.test.ts";
  assert.equal(hashObject(authority), "ce6d69c3e41888d5a7aec504ebbac87a8c866c19");
  assert.equal(hashObject(test), "d644ba4ff6c001d7c6e2d9df902285630df0b917");
  run("git", ["apply", "--unidiff-zero", "--whitespace=nowarn",
    path.join(root, "deploy/recovery/alice-v4-control.patch")], { cwd: oldRoot });
  assert.equal(hashObject(authority), "bea4a2a388e23b4a5c969160742a4e44538ae803");
  assert.equal(hashObject(test), "026540d39050aec3eda7fe5b6d3c6564a92ec862");
  const { vars, secrets } = varsAndSecrets(previous);
  const sourceConfigPath = path.join(oldRoot, "workers/alice-production-control/wrangler.jsonc");
  const config = JSON.parse(fs.readFileSync(sourceConfigPath, "utf8"));
  exact(Object.keys(config.vars).sort(), Object.keys(vars).sort());
  exact([...config.secrets.required].sort(), secrets);
  config.vars = vars;
  config.main = path.join(oldRoot, "workers/alice-production-control/src/index.ts");
  fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const check = `import {loadRuntimeConfig} from './workers/alice-production-control/src/runtime-config.ts';
    const c=await loadRuntimeConfig(process.env);
    console.log(JSON.stringify({epoch:c.envelope.release.releaseEpoch,program:c.binding.programDigest,
      release:c.binding.releaseDigest,manifest:c.deploymentManifestSha256}));`;
  const admitted = JSON.parse(run("bun", ["-e", check], { cwd: oldRoot,
    env: { ...process.env, ...vars, ALICE_CONTROL_RECOVERY_TOKEN: "x".repeat(48) } }));
  exact(admitted, { epoch: 15, program: oldProgram, release: oldRelease, manifest: oldManifest });
  run("bun", ["test", test], { cwd: oldRoot });
  run("wrangler", ["versions", "upload", "--dry-run", "--config", configPath,
    "--outdir", path.join(temp, "alice-v4-control-build")], { cwd: oldRoot });
  console.log(JSON.stringify({ code: "ALICE_V4_CONTROL_PREPARED", baseCommit,
    authorityBlob: hashObject(authority), manifest: oldManifest }));
}

async function cloudflare(pathname) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`ALICE_RECOVERY_PROVIDER_HTTP_${response.status}`);
  const body = await response.json();
  if (body.success !== true) fail("ALICE_RECOVERY_PROVIDER_ENVELOPE_INVALID");
  return body.result;
}
async function deploymentVersion(worker) {
  const body = await cloudflare(`/accounts/${account}/workers/scripts/${worker}/deployments`);
  const current = body.deployments?.[0];
  if (current?.versions?.length !== 1 || current.versions[0].percentage !== 100) {
    fail("ALICE_RECOVERY_DEPLOYMENT_AMBIGUOUS");
  }
  return current.versions[0].version_id;
}
async function inertCodingSandbox() {
  const worker = "alice-coding-sandbox";
  const scripts = await cloudflare(`/accounts/${account}/workers/scripts?per_page=100`);
  if (!Array.isArray(scripts) || scripts.length >= 100 ||
      scripts.filter(item => item.id === worker).length !== 1) {
    fail("ALICE_RECOVERY_CODING_SANDBOX_DRIFTED");
  }
  const version = await deploymentVersion(worker);
  if (!uuid.test(version) || !version.startsWith("a7761bc2-")) {
    fail("ALICE_RECOVERY_CODING_SANDBOX_VERSION_DRIFTED");
  }
  const subdomain = await cloudflare(`/accounts/${account}/workers/scripts/${worker}/subdomain`);
  const routes = await cloudflare(`/zones/${zone}/workers/routes?per_page=100`);
  const domains = await cloudflare(`/accounts/${account}/workers/domains?per_page=100`);
  if (subdomain?.enabled !== false || subdomain?.previews_enabled !== false ||
      !Array.isArray(routes) || routes.length >= 100 ||
      routes.some(item => item.script === worker) ||
      !Array.isArray(domains) || domains.length >= 100 ||
      domains.some(item => item.service === worker)) {
    fail("ALICE_RECOVERY_CODING_SANDBOX_EXPOSED");
  }
  return version;
}
async function status(expectedVersion, expectedProgram, expectedRelease) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const response = await fetch("https://alice-release.rndrntwrk.com/control/internal/v1/deployment/status", {
    headers: {
      accept: "application/json", "cache-control": "no-store",
      "cf-access-client-id": process.env.ALICE_RELEASE_ACCESS_CLIENT_ID,
      "cf-access-client-secret": process.env.ALICE_RELEASE_ACCESS_CLIENT_SECRET,
      "x-alice-deployment-pause-token": process.env.ALICE_DEPLOYMENT_PAUSE_TOKEN,
      "x-alice-deployment-edge-nonce": nonce,
    }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`ALICE_RECOVERY_STATUS_HTTP_${response.status}`);
  const body = await response.json();
  if (body.ok !== true || body.authority?.activeReleaseEpoch !== 15 ||
      body.authority?.deploymentManifestSha256 !== oldManifest ||
      body.authority?.binding?.programDigest !== oldProgram ||
      body.authority?.binding?.releaseDigest !== oldRelease ||
      !body.authority?.pausedScopes?.includes("all") ||
      body.edgeReadiness?.nonce !== nonce ||
      body.edgeReadiness?.workerVersionId !== expectedVersion ||
      body.edgeReadiness?.servingCandidate?.binding?.programDigest !== expectedProgram ||
      body.edgeReadiness?.servingCandidate?.binding?.releaseDigest !== expectedRelease) {
    fail("ALICE_RECOVERY_STATUS_MISMATCH");
  }
  return body;
}
function comparableResources(resources) {
  const copy = structuredClone(resources);
  delete copy.script.etag;
  delete copy.script.handlers;
  delete copy.script.named_handlers;
  delete copy.script.last_deployed_from;
  delete copy.script_runtime.cache_options;
  delete copy.script_runtime.compatibility_flags;
  delete copy.script_runtime.exports;
  delete copy.script_runtime.limits;
  copy.bindings.sort((left, right) =>
    `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
  return copy;
}
async function promote() {
  const previous = anchor();
  const { secrets } = varsAndSecrets(previous);
  const worker = "alice-production-control";
  const original = await deploymentVersion(worker);
  assert.equal(original, pausedReaderVersion);
  const before = await status(pausedReaderVersion,
    "sha256:5ab05a60ed27bf8d40336e019440d2be42d88bb5b553674b068f42841d6df86e",
    "sha256:582624c5c9d95b397410e11594ca97a3fe5c8f6fb1e92764cdfbda659b1c9085");
  const current = await cloudflare(`/accounts/${account}/workers/scripts/${worker}/versions/${original}`);
  exact(current.resources.bindings.filter(item => item.type === "secret_text")
    .map(item => item.name).sort(), [...secrets, retainedSecret].sort());
  const retainedBinding = current.resources.bindings.find(item => item.name === retainedSecret);
  assert.equal(retainedBinding.type, "secret_text");
  for (const [role, value] of Object.entries(previous.workers)) {
    if (role === "control" || role === "codingSandbox") continue;
    assert.equal(await deploymentVersion(value.worker), value.serving.versionId);
  }
  assert.equal(previous.workers.codingSandbox.absent, true);
  const codingVersion = await inertCodingSandbox();
  const app = await cloudflare(`/accounts/${account}/containers/applications/${previous.containerApplication.applicationId}`);
  assert.equal(app.configuration.image, previous.containerApplication.target.configuration.image);
  const listed = await cloudflare(`/accounts/${account}/workers/scripts/${worker}/versions?per_page=20`);
  const versions = listed.items;
  if (!Array.isArray(versions) || versions[0]?.id !== recoveryVersion) {
    fail("ALICE_RECOVERY_UPLOADED_VERSION_DRIFTED");
  }
  const uploaded = await cloudflare(`/accounts/${account}/workers/scripts/${worker}/versions/${recoveryVersion}`);
  const expectedResources = structuredClone(previous.workers.control.versionResources);
  expectedResources.bindings.push(retainedBinding);
  exact(uploaded.resources.script.handlers, ["fetch", "queue"]);
  exact(uploaded.resources.script.named_handlers, [
    { name: "AliceAuthority", handlers: ["class"] },
    { name: "AliceSession", handlers: ["class"] },
    { name: "AlicePlanWorkflow", handlers: ["__workflow_entrypoint", "run"] },
  ]);
  assert.equal(uploaded.resources.script.last_deployed_from, "wrangler");
  for (const field of ["cache_options", "compatibility_flags", "exports", "limits"]) {
    assert.equal(uploaded.resources.script_runtime[field], undefined);
  }
  exact(expectedResources.script_runtime.cache_options, null);
  exact(expectedResources.script_runtime.compatibility_flags, []);
  exact(expectedResources.script_runtime.exports, {});
  exact(expectedResources.script_runtime.limits, null);
  if (canonicalAliceJson(comparableResources(uploaded.resources)) !==
      canonicalAliceJson(comparableResources(expectedResources))) {
    fail("ALICE_RECOVERY_UPLOADED_BINDINGS_DRIFTED");
  }
  assert.equal(await deploymentVersion(worker), original);
  assert.equal(await inertCodingSandbox(), codingVersion);
  const beforeDeploy = await status(pausedReaderVersion,
    before.edgeReadiness.servingCandidate.binding.programDigest,
    before.edgeReadiness.servingCandidate.binding.releaseDigest);
  assert.equal(beforeDeploy.authority.admissionGeneration, before.authority.admissionGeneration);
  run("wrangler", ["versions", "deploy", `${recoveryVersion}@100`, "--name", worker,
    "--message", "Restore admitted v15 control with v4 ledger reader", "--yes"], { cwd: oldRoot });
  try {
    assert.equal(await deploymentVersion(worker), recoveryVersion);
    const after = await status(recoveryVersion, oldProgram, oldRelease);
    assert.equal(after.authority.admissionGeneration, before.authority.admissionGeneration);
    console.log(JSON.stringify({ code: "ALICE_V4_CONTROL_RESTORED_PAUSED", versionId: recoveryVersion,
      releaseEpoch: 15, pausedAll: true, manifest: oldManifest }));
  } catch (error) {
    run("wrangler", ["versions", "deploy", `${pausedReaderVersion}@100`, "--name", worker,
      "--message", "Revert failed v4 control recovery while paused", "--yes"], { cwd: oldRoot });
    assert.equal(await deploymentVersion(worker), pausedReaderVersion);
    throw error;
  }
}

const phase = process.argv[2];
if (phase === "prepare") prepare();
else if (phase === "promote") await promote();
else fail("ALICE_RECOVERY_PHASE_INVALID");
