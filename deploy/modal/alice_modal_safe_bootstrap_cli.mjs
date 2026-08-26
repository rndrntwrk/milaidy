import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import {
  digestAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";
import {
  buildAliceModalLegacyTransitionJournal,
  buildAliceModalSafeBootstrapResult,
  orchestrateAliceModalSafeBootstrap,
  resolveAliceModalSafeRecovery,
  verifyAliceModalLegacyTransitionJournal,
  verifyAliceModalSafeBootstrapHttp,
  verifyAliceModalSafeRollbackAnchor,
} from "./alice_modal_safe_bootstrap.mjs";
import {
  aliceModalCommandEnv,
  buildAliceModalReleaseCommands,
} from "./alice_modal_release.mjs";

const PROTECTED_BRANCH = "release/alice-production-core-2026-08-22";
const REPOSITORY = "rndrntwrk/milaidy";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function invalid(code = "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID") {
  throw new Error(code);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function run(binary, argv, { cwd, env, code }) {
  const execution = spawnSync(binary, argv, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (execution.error || execution.status !== 0) invalid(code);
  return execution.stdout;
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    invalid(code);
  }
}

function readJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size <= 0 ||
      stat.size > 16 * 1024 * 1024
    ) {
      invalid();
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) throw error;
    invalid();
  }
}

function writeReadonly(filePath, value) {
  if (!absolute(filePath) || !fs.existsSync(path.dirname(filePath))) invalid();
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

function exactReleaseFromEvidence(evidence, manifest, manifestSha256) {
  const release = {
    programDigest: evidence?.programDigest,
    releaseDigest: evidence?.releaseDigest,
    policyHash: evidence?.policyHash,
    sourceCommit: evidence?.sourceCommit,
    deploymentControllerCommit: evidence?.deploymentControllerCommit,
    runtimeImage: evidence?.runtimeImage,
    runtimeBuildManifestSha256: evidence?.runtimeBuildManifestSha256,
    deploymentManifestSha256: evidence?.deploymentManifestSha256,
    elizaCommit: evidence?.elizaCommit,
    modalRevision: evidence?.modalRevision,
  };
  if (
    evidence?.schemaVersion !== "alice.program-admission.v1" ||
    release.sourceCommit !== manifest.source.sourceCommit ||
    release.deploymentControllerCommit !==
      manifest.source.deploymentControllerCommit ||
    release.runtimeImage !== manifest.source.runtimeImage ||
    release.runtimeBuildManifestSha256 !==
      manifest.source.runtimeBuildManifestSha256 ||
    release.elizaCommit !== manifest.source.elizaCommit ||
    release.policyHash !== manifest.release.policyHash ||
    release.modalRevision !== manifest.release.modalRevision ||
    release.deploymentManifestSha256 !== manifestSha256 ||
    !DIGEST.test(release.programDigest ?? "") ||
    !DIGEST.test(release.releaseDigest ?? "") ||
    !COMMIT.test(release.sourceCommit ?? "")
  ) {
    invalid("ALICE_PROGRAM_ADMISSION_INVALID");
  }
  return release;
}

function verifySource({ sourceRoot, sourceCommit }) {
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    env: process.env,
    code: "ALICE_MODAL_SOURCE_INVALID",
  }).trim();
  const branch = process.env.GITHUB_REF
    ? process.env.GITHUB_REF.replace(/^refs\/heads\//, "")
    : run("git", ["branch", "--show-current"], {
        cwd: sourceRoot,
        env: process.env,
        code: "ALICE_MODAL_SOURCE_INVALID",
      }).trim();
  if (
    head !== sourceCommit ||
    branch !== PROTECTED_BRANCH ||
    (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== head) ||
    run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: sourceRoot,
      env: process.env,
      code: "ALICE_MODAL_SOURCE_INVALID",
    }) !== ""
  ) {
    invalid("ALICE_MODAL_SOURCE_INVALID");
  }
}

function verifyProtectedRef({ sourceRoot, sourceCommit }) {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) {
    invalid("ALICE_MODAL_PROTECTED_REF_INVALID");
  }
  const remote = run("gh", [
    "api",
    `repos/${REPOSITORY}/git/ref/heads/${PROTECTED_BRANCH}`,
    "--jq",
    ".object.sha",
  ], {
    cwd: sourceRoot,
    env: {
      GH_TOKEN: process.env.GH_TOKEN,
      PATH: process.env.PATH,
      ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
      ...(process.env.LC_ALL ? { LC_ALL: process.env.LC_ALL } : {}),
    },
    code: "ALICE_MODAL_PROTECTED_REF_INVALID",
  }).trim();
  if (remote !== sourceCommit) invalid("ALICE_MODAL_PROTECTED_REF_INVALID");
}

function releaseCommandEnv(commandEnv, release) {
  return {
    ...commandEnv,
    ALICE_PROGRAM_DIGEST: release.programDigest,
    ALICE_RELEASE_DIGEST: release.releaseDigest,
    ALICE_POLICY_HASH: release.policyHash,
    ALICE_SOURCE_COMMIT: release.sourceCommit,
    ALICE_DEPLOYMENT_CONTROLLER_COMMIT: release.deploymentControllerCommit,
    ALICE_RUNTIME_BUILD_MANIFEST_SHA256:
      release.runtimeBuildManifestSha256,
    ALICE_DEPLOYMENT_MANIFEST_SHA256: release.deploymentManifestSha256,
    ALICE_ELIZA_COMMIT: release.elizaCommit,
  };
}

async function main() {
  const phase = process.env.ALICE_MODAL_SAFE_BOOTSTRAP_PHASE;
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
  const admissionPath = process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const transitionPath = process.env.ALICE_MODAL_LEGACY_TRANSITION_PATH;
  const anchorPath = process.env.ALICE_MODAL_ROLLBACK_ANCHOR_PATH;
  const evidencePath = process.env.ALICE_MODAL_SAFE_BOOTSTRAP_EVIDENCE_PATH;
  const mutationJournalPath = process.env.ALICE_MODAL_MUTATION_JOURNAL_PATH;
  const modalBin = process.env.ALICE_MODAL_BIN;
  const pythonBin = process.env.ALICE_MODAL_PYTHON_BIN;
  if (
    !["capture", "deploy", "recover"].includes(phase) ||
    ![
      sourceRoot,
      manifestPath,
      admissionPath,
      transitionPath,
      anchorPath,
      evidencePath,
      modalBin,
      pythonBin,
    ].every(absolute) ||
    (phase === "recover" && !absolute(mutationJournalPath))
  ) {
    invalid();
  }

  const serializedManifest = fs.readFileSync(manifestPath, "utf8");
  const manifest = verifyAliceDeploymentManifest(serializedManifest);
  const manifestSha256 = digestAliceDeploymentManifest(serializedManifest);
  const release = exactReleaseFromEvidence(
    readJson(admissionPath),
    manifest,
    manifestSha256,
  );
  verifySource({ sourceRoot, sourceCommit: release.sourceCommit });
  let recoveryDecision = null;
  if (phase === "recover") {
    recoveryDecision = resolveAliceModalSafeRecovery({
      release,
      transition: fs.existsSync(transitionPath) ? readJson(transitionPath) : null,
      anchor: fs.existsSync(anchorPath) ? readJson(anchorPath) : null,
      mutationJournalPresent: fs.existsSync(mutationJournalPath),
    });
    if (recoveryDecision.action === "pre-modal-noop") {
      if (fs.existsSync(evidencePath)) {
        invalid("ALICE_MODAL_RECOVERY_STATE_INVALID");
      }
      writeReadonly(evidencePath, recoveryDecision);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase,
        action: recoveryDecision.action,
        stopped: false,
      })}\n`);
      return;
    }
    if (recoveryDecision.action === "safe-anchor") {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase,
        action: recoveryDecision.action,
        stopped: false,
      })}\n`);
      return;
    }
    if (recoveryDecision.action !== "stop-if-unanchored") {
      invalid("ALICE_MODAL_RECOVERY_STATE_INVALID");
    }
  }
  const commandEnv = aliceModalCommandEnv(process.env);
  const commands = buildAliceModalReleaseCommands({
    modalBin,
    pythonBin,
    sourceRoot,
    secretName: process.env.ALICE_MODAL_RELEASE_SECRET_NAME,
    secretJsonPath: path.join(os.tmpdir(), "unused-alice-bootstrap-secret.json"),
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: manifestSha256,
    modalRevision: release.modalRevision,
  });
  if (run(modalBin, commands.version, {
    cwd: sourceRoot,
    env: commandEnv,
    code: "ALICE_MODAL_VERSION_INVALID",
  }).trim() !== "modal client version: 1.5.4") {
    invalid("ALICE_MODAL_VERSION_INVALID");
  }
  const pythonJson = (argv, code) => parseJson(run(pythonBin, argv, {
    cwd: sourceRoot,
    env: commandEnv,
    code,
  }), code);
  const modalJson = (argv, code) => parseJson(run(modalBin, argv, {
    cwd: sourceRoot,
    env: commandEnv,
    code,
  }), code);

  const verifyStopped = async () => {
    for (let attempt = 1; attempt <= 13; attempt += 1) {
      const apps = modalJson(commands.apps, "ALICE_MODAL_SAFE_STOP_INVALID");
      const containers = modalJson(
        commands.containers,
        "ALICE_MODAL_SAFE_STOP_INVALID",
      );
      const aliceApps = apps.filter((item) => item?.app_id === "ap-oFaCNy2jJDFalZienNB2Ht");
      if (
        containers.length === 0 &&
        (aliceApps.length === 0 ||
          aliceApps.length === 1 &&
          aliceApps[0]?.state === "stopped" &&
          aliceApps[0]?.tasks === "0")
      ) {
        return;
      }
      if (attempt < 13) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    invalid("ALICE_MODAL_SAFE_STOP_INVALID");
  };
  const stopApp = async () => {
    run(modalBin, commands.stopApp, {
      cwd: sourceRoot,
      env: commandEnv,
      code: "ALICE_MODAL_SAFE_STOP_FAILED",
    });
  };
  const readSafeState = async () => {
    let lastError;
    for (let attempt = 1; attempt <= 19; attempt += 1) {
      try {
        const state = {
          tokenInfo: run(modalBin, commands.tokenInfo, {
            cwd: sourceRoot,
            env: commandEnv,
            code: "ALICE_MODAL_WORKSPACE_INVALID",
          }),
          environments: modalJson(
            commands.environments,
            "ALICE_MODAL_ENVIRONMENT_INVALID",
          ),
          apps: modalJson(commands.apps, "ALICE_MODAL_APP_INVALID"),
          history: modalJson(commands.history, "ALICE_MODAL_HISTORY_INVALID"),
          containers: modalJson(commands.containers, "ALICE_MODAL_IDLE_INVALID"),
          layout: pythonJson(
            commands.providerSafeBootstrap,
            "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID",
          ),
        };
        if (state.containers.length === 0) return state;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    throw lastError ?? new Error("ALICE_MODAL_SAFE_BOOTSTRAP_INVALID");
  };
  const verifyRuntime = async () => {
    let lastError;
    for (let attempt = 1; attempt <= 16; attempt += 1) {
      try {
        return await verifyAliceModalSafeBootstrapHttp({
          release,
          modalProxyKey: process.env.ALICE_MODAL_PROXY_KEY,
          modalProxySecret: process.env.ALICE_MODAL_PROXY_SECRET,
        });
      } catch (error) {
        lastError = error;
      }
      if (attempt < 16) await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    throw lastError ?? new Error("ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID");
  };

  if (phase === "capture") {
    verifyProtectedRef({ sourceRoot, sourceCommit: release.sourceCommit });
    const previous = pythonJson(
      commands.providerCaptureCurrent,
      "ALICE_MODAL_LEGACY_TRANSITION_INVALID",
    );
    try {
      const journal = buildAliceModalLegacyTransitionJournal({
        previous,
        release,
      });
      writeReadonly(transitionPath, journal);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase,
        appId: journal.appId,
        previousProviderVersion: journal.previousProviderVersion,
        previousGraphSha256: journal.previousGraphSha256,
      })}\n`);
      return;
    } catch (legacyError) {
      try {
        const result = buildAliceModalSafeBootstrapResult({
          release,
          state: await readSafeState(),
          runtime: await verifyRuntime(),
        });
        writeReadonly(evidencePath, result.safeBootstrapEvidence);
        writeReadonly(anchorPath, result.anchor);
        process.stdout.write(`${JSON.stringify({
          ok: true,
          phase,
          reentered: true,
          appId: result.anchor.appId,
          providerVersion: result.anchor.previous.providerVersion,
        })}\n`);
        return;
      } catch (safeError) {
        let stopError;
        try {
          await stopApp();
          await verifyStopped();
        } catch (caught) {
          stopError = caught;
        }
        const failure = new AggregateError(
          stopError ? [legacyError, safeError, stopError] : [legacyError, safeError],
          stopError
            ? "ALICE_MODAL_REENTRY_AND_STOP_FAILED"
            : "ALICE_MODAL_REENTRY_REJECTED_APP_STOPPED",
        );
        failure.modalSafeStopVerified = !stopError;
        throw failure;
      }
    }
  }

  if (phase === "recover") {
    await stopApp();
    await verifyStopped();
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase,
      action: recoveryDecision.action,
      stopped: true,
    })}\n`);
    return;
  }

  if (fs.existsSync(anchorPath)) {
    const anchor = verifyAliceModalSafeRollbackAnchor(readJson(anchorPath), {
      release,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase,
      stopped: false,
      reentered: true,
      providerVersion: anchor.previous.providerVersion,
    })}\n`);
    return;
  }
  const journal = verifyAliceModalLegacyTransitionJournal(readJson(transitionPath));
  if (canonicalAliceJson(journal.release) !== canonicalAliceJson(release)) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
  }
  const safeEnv = releaseCommandEnv(commandEnv, release);
  const result = await orchestrateAliceModalSafeBootstrap({
    journal,
    release,
    operations: {
      captureLegacy: async () => pythonJson(
        commands.providerCaptureCurrent,
        "ALICE_MODAL_LEGACY_TRANSITION_INVALID",
      ),
      verifyProtectedRef: async () => verifyProtectedRef({
        sourceRoot,
        sourceCommit: release.sourceCommit,
      }),
      deploySafeBootstrap: async () => run(modalBin, commands.deployBootstrap, {
        cwd: sourceRoot,
        env: safeEnv,
        code: "ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED",
      }),
      readSafeBootstrapState: readSafeState,
      verifySafeBootstrapRuntime: verifyRuntime,
      stopApp,
      verifyAppStopped: verifyStopped,
    },
  });
  writeReadonly(evidencePath, result.safeBootstrapEvidence);
  writeReadonly(anchorPath, result.anchor);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    phase,
    appId: result.anchor.appId,
    providerVersion: result.anchor.previous.providerVersion,
    safeBootstrap: true,
  })}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
