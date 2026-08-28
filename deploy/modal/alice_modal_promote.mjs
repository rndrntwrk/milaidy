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
  aliceModalCommandEnv,
  buildAliceModalReleaseCommands,
  buildAliceModalReleaseSecret,
  buildAliceModalRollbackCommands,
  digestAliceModalProviderGraph,
  verifyAliceModalProviderReadback,
  verifyAliceModalProviderRestoration,
  verifyAliceModalRollbackAnchorLayout,
  verifyAliceModalProviderTerminalCoherence,
  verifyAliceModalProviderTransition,
  verifyAliceModalRuntimeHttp,
} from "./alice_modal_release.mjs";
import { verifyAliceModalSafeRollbackAnchor } from "./alice_modal_safe_bootstrap.mjs";

const PROTECTED_BRANCH = "release/alice-production-core-2026-08-22";
const REPOSITORY = "rndrntwrk/milaidy";
const MODAL_VERSION = "1.5.4";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const RELEASE_SECRET =
  /^alice-production-core-[a-f0-9]{64}-[1-9][0-9]*-[1-9][0-9]*$/;
const SECRET_ID = /^st-[A-Za-z0-9]{20,32}$/;

function invalid(code = "ALICE_MODAL_PROMOTION_INVALID") {
  throw new Error(code);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function exactKeys(value, keys) {
  return object(value) &&
    canonicalAliceJson(Object.keys(value).sort()) ===
      canonicalAliceJson([...keys].sort());
}

function validRelease(value) {
  return Boolean(
    exactKeys(value, [
      "programDigest",
      "releaseDigest",
      "policyHash",
      "sourceCommit",
      "deploymentControllerCommit",
      "runtimeImage",
      "runtimeBuildManifestSha256",
      "capabilityBomSha256",
      "deploymentManifestSha256",
      "elizaCommit",
      "modalRevision",
    ]) &&
    DIGEST.test(value.programDigest ?? "") &&
    DIGEST.test(value.releaseDigest ?? "") &&
    DIGEST.test(value.policyHash ?? "") &&
    COMMIT.test(value.sourceCommit ?? "") &&
    COMMIT.test(value.deploymentControllerCommit ?? "") &&
    /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(
      value.runtimeImage ?? "",
    ) &&
    DIGEST.test(value.runtimeBuildManifestSha256 ?? "") &&
    DIGEST.test(value.capabilityBomSha256 ?? "") &&
    DIGEST.test(value.deploymentManifestSha256 ?? "") &&
    COMMIT.test(value.elizaCommit ?? "") &&
    Number.isSafeInteger(value.modalRevision) &&
    value.modalRevision >= 49
  );
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

function verifyProtectedRefStillExact({ sourceRoot, sourceCommit }) {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) {
    invalid("ALICE_MODAL_PROTECTED_REF_INVALID");
  }
  const remote = run(
    "gh",
    [
      "api",
      `repos/${REPOSITORY}/git/ref/heads/${PROTECTED_BRANCH}`,
      "--jq",
      ".object.sha",
    ],
    {
      cwd: sourceRoot,
      env: {
        GH_TOKEN: process.env.GH_TOKEN,
        PATH: process.env.PATH,
        ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
        ...(process.env.LC_ALL ? { LC_ALL: process.env.LC_ALL } : {}),
      },
      code: "ALICE_MODAL_PROTECTED_REF_INVALID",
    },
  ).trim();
  if (remote !== sourceCommit) {
    invalid("ALICE_MODAL_PROTECTED_REF_INVALID");
  }
}

function parseJson(value, code = "ALICE_MODAL_PROVIDER_READBACK_INVALID") {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024 * 1024) {
    invalid(code);
  }
  try {
    return JSON.parse(value);
  } catch {
    invalid(code);
  }
}

function readJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 * 1024) {
      invalid();
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) throw error;
    invalid();
  }
}

function readSecretFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    const value = fs.readFileSync(filePath, "utf8");
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== 0o600 ||
      value.length < 32 ||
      value.length > 4096 ||
      /[\0\r\n]/.test(value)
    ) {
      invalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) throw error;
    invalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
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

function exactReleaseFromEvidence(evidence, manifest, deploymentManifestSha256) {
  const release = {
    programDigest: evidence?.programDigest,
    releaseDigest: evidence?.releaseDigest,
    policyHash: evidence?.policyHash,
    sourceCommit: evidence?.sourceCommit,
    deploymentControllerCommit: evidence?.deploymentControllerCommit,
    runtimeImage: evidence?.runtimeImage,
    runtimeBuildManifestSha256: evidence?.runtimeBuildManifestSha256,
    capabilityBomSha256: evidence?.capabilityBomSha256,
    deploymentManifestSha256: evidence?.deploymentManifestSha256,
    elizaCommit: evidence?.elizaCommit,
    modalRevision: evidence?.modalRevision,
  };
  if (
    evidence?.schemaVersion !== "alice.program-admission.v1" ||
    !canonicalIsoTimestamp(evidence?.admittedAt) ||
    release.sourceCommit !== manifest.source.sourceCommit ||
    release.deploymentControllerCommit !==
      manifest.source.deploymentControllerCommit ||
    release.runtimeImage !== manifest.source.runtimeImage ||
    release.runtimeBuildManifestSha256 !==
      manifest.source.runtimeBuildManifestSha256 ||
    release.capabilityBomSha256 !== manifest.source.capabilityBomSha256 ||
    release.elizaCommit !== manifest.source.elizaCommit ||
    release.policyHash !== manifest.release.policyHash ||
    release.modalRevision !== manifest.release.modalRevision ||
    release.deploymentManifestSha256 !== deploymentManifestSha256 ||
    !DIGEST.test(release.programDigest ?? "") ||
    !DIGEST.test(release.releaseDigest ?? "")
  ) {
    invalid("ALICE_PROGRAM_ADMISSION_INVALID");
  }
  return release;
}

function secretNames(value) {
  const parsed = typeof value === "string"
    ? parseJson(value, "ALICE_MODAL_SECRET_INVENTORY_INVALID")
    : value;
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => !object(item) || typeof item.name !== "string") ||
    new Set(parsed.map((item) => item.name)).size !== parsed.length
  ) {
    invalid("ALICE_MODAL_SECRET_INVENTORY_INVALID");
  }
  return parsed.map((item) => item.name).sort();
}

function secretInventory(value) {
  const parsed = typeof value === "string"
    ? parseJson(value, "ALICE_MODAL_SECRET_INVENTORY_INVALID")
    : value;
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) =>
      !exactKeys(item, ["id", "name"]) ||
      !SECRET_ID.test(item.id ?? "") ||
      typeof item.name !== "string" ||
      !/^[a-z0-9][a-z0-9-]{2,127}$/.test(item.name)) ||
    new Set(parsed.map((item) => item.id)).size !== parsed.length ||
    new Set(parsed.map((item) => item.name)).size !== parsed.length
  ) {
    invalid("ALICE_MODAL_SECRET_INVENTORY_INVALID");
  }
  return [...parsed].sort((left, right) =>
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function validReleaseSecretObject(value, secretName) {
  return Boolean(
    exactKeys(value, ["id", "name"]) &&
    SECRET_ID.test(value.id ?? "") &&
    value.name === secretName,
  );
}

export function verifyAliceModalMutationJournal(value, { anchor }) {
  if (!validRelease(value?.release)) {
    invalid("ALICE_MODAL_MUTATION_JOURNAL_INVALID");
  }
  const verifiedAnchor = verifyAliceModalSafeRollbackAnchor(anchor, {
    release: value.release,
  });
  const previous = verifyAliceModalRollbackAnchorLayout(
    verifiedAnchor.previous,
  );
  if (
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "phase",
      "release",
      "secretName",
      "appId",
      "previousProviderVersion",
      "previousGraphSha256",
      "releaseSecretAbsent",
    ]) ||
    value.schemaVersion !== "alice.modal-mutation-journal.v1" ||
    !canonicalIsoTimestamp(value.observedAt) ||
    value.phase !== "predeploy" ||
    !validRelease(value.release) ||
    !value.secretName.startsWith(
      `alice-production-core-${value.release.releaseDigest.slice("sha256:".length)}-`,
    ) ||
    !RELEASE_SECRET.test(value.secretName) ||
    value.appId !== previous.appId ||
    value.previousProviderVersion !== previous.providerVersion ||
    value.previousGraphSha256 !== digestAliceModalProviderGraph(previous) ||
    value.releaseSecretAbsent !== true ||
    anchor?.sourceCommit !== value.release.sourceCommit ||
    anchor?.deploymentManifestSha256 !==
      value.release.deploymentManifestSha256 ||
    anchor?.appId !== previous.appId
  ) {
    invalid("ALICE_MODAL_MUTATION_JOURNAL_INVALID");
  }
  return value;
}

export async function orchestrateAliceModalPromotion({
  release,
  secretName,
  operations,
  observedAt = new Date().toISOString(),
}) {
  if (
    !object(release) ||
    !secretName?.startsWith(
      `alice-production-core-${release.releaseDigest?.slice("sha256:".length)}-`,
    ) ||
    !RELEASE_SECRET.test(secretName ?? "") ||
    !canonicalIsoTimestamp(observedAt) ||
    !object(operations) ||
    ![
      "captureCurrentLayout",
      "persistRollbackAnchor",
      "persistMutationJournal",
      "verifyProtectedRef",
      "createReleaseSecret",
      "cleanupReleaseSecret",
      "deployCandidate",
      "readReleaseState",
      "verifyRuntime",
      "rollbackTo",
      "captureEnforcedCurrentLayout",
    ].every((name) => typeof operations[name] === "function")
  ) {
    invalid();
  }

  const previous = await operations.captureCurrentLayout();
  verifyAliceModalRollbackAnchorLayout(previous);
  await operations.persistRollbackAnchor(previous);
  let appMutationAttempted = false;
  let createdReleaseSecret;
  let candidateLayout;
  try {
    await operations.verifyProtectedRef();
    await operations.persistMutationJournal({
      schemaVersion: "alice.modal-mutation-journal.v1",
      observedAt,
      phase: "predeploy",
      release,
      secretName,
      appId: previous.appId,
      previousProviderVersion: previous.providerVersion,
      previousGraphSha256: digestAliceModalProviderGraph(previous),
      releaseSecretAbsent: true,
    });
    const created = await operations.createReleaseSecret();
    if (!validReleaseSecretObject(created, secretName)) {
      invalid("ALICE_MODAL_SECRET_CREATE_FAILED");
    }
    createdReleaseSecret = created;
    await operations.verifyProtectedRef();
    appMutationAttempted = true;
    await operations.deployCandidate();

    const candidateState = await operations.readReleaseState();
    candidateLayout = candidateState?.layout;
    const candidateProvider = verifyAliceModalProviderReadback(candidateState, {
      release,
      releaseSecretObject: createdReleaseSecret,
      secretName,
      expectedProviderVersion: candidateLayout?.providerVersion,
      expectedRollbackVersion: 0,
    });
    const candidateRuntime = await operations.verifyRuntime();

    await operations.verifyProtectedRef();
    await operations.rollbackTo(previous.providerVersion);
    const rolledBack = await operations.captureEnforcedCurrentLayout();
    verifyAliceModalProviderRestoration({ expected: previous, restored: rolledBack });

    await operations.verifyProtectedRef();
    await operations.rollbackTo(candidateLayout.providerVersion);
    const forwardedStateBefore = await operations.readReleaseState();
    const forwarded = forwardedStateBefore?.layout;
    const rollbackForwardProof = verifyAliceModalProviderTransition({
      previous,
      candidate: candidateLayout,
      rolledBack,
      forwarded,
    });
    verifyAliceModalProviderReadback(forwardedStateBefore, {
      release,
      secretName,
      expectedProviderVersion: forwarded.providerVersion,
      expectedRollbackVersion: candidateLayout.providerVersion,
    });
    const terminalRuntime = await operations.verifyRuntime();
    const forwardedStateAfter = await operations.readReleaseState();
    const providerReadback = verifyAliceModalProviderTerminalCoherence({
      before: forwardedStateBefore,
      after: forwardedStateAfter,
      release,
      secretName,
      expectedProviderVersion: forwarded.providerVersion,
      expectedRollbackVersion: candidateLayout.providerVersion,
    });
    return {
      schemaVersion: "alice.modal-promotion-evidence.v1",
      observedAt,
      release,
      previousProviderVersion: previous.providerVersion,
      candidateProviderVersion: candidateLayout.providerVersion,
      terminalProviderVersion: forwarded.providerVersion,
      candidateProvider,
      candidateRuntime,
      rollbackForwardProof,
      providerReadback,
      terminalRuntime,
      releaseSecretObject: createdReleaseSecret,
    };
  } catch (error) {
    let restoration;
    let rollbackError;
    let cleanupError;
    let releaseSecretAbsent = false;
    if (appMutationAttempted) {
      try {
        const current = await operations.captureCurrentLayout();
        verifyAliceModalRollbackAnchorLayout(current);
        if (canonicalAliceJson(current) === canonicalAliceJson(previous)) {
          restoration = {
            schemaVersion: "alice.modal-no-mutation-proof.v1",
            appId: previous.appId,
            providerVersion: previous.providerVersion,
            graphSha256: digestAliceModalProviderGraph(previous),
          };
        } else {
          try {
            restoration = verifyAliceModalProviderRestoration({
              expected: previous,
              restored: current,
            });
          } catch {
            await operations.rollbackTo(
              previous.providerVersion,
              current.providerVersion,
            );
            const restored = await operations.captureEnforcedCurrentLayout();
            restoration = verifyAliceModalProviderRestoration({
              expected: previous,
              restored,
            });
            if (restored.providerVersion <= current.providerVersion) {
              invalid("ALICE_MODAL_ROLLBACK_PROOF_INVALID");
            }
          }
        }
      } catch (caught) {
        rollbackError = caught;
      }
    } else if (createdReleaseSecret) {
      restoration = {
        schemaVersion: "alice.modal-no-mutation-proof.v1",
        appId: previous.appId,
        providerVersion: previous.providerVersion,
        graphSha256: digestAliceModalProviderGraph(previous),
      };
    } else {
      throw error;
    }
    if (createdReleaseSecret) {
      try {
        await operations.cleanupReleaseSecret(createdReleaseSecret);
        releaseSecretAbsent = true;
      } catch (caught) {
        cleanupError = caught;
      }
    }
    const failures = [error];
    if (rollbackError) failures.push(rollbackError);
    if (cleanupError) failures.push(cleanupError);
    const failure = new AggregateError(
      failures,
      rollbackError || cleanupError
        ? "ALICE_MODAL_PROMOTION_AND_RECOVERY_FAILED"
        : "ALICE_MODAL_PROMOTION_FAILED_ROLLBACK_RESTORED",
    );
    failure.modalRollbackVerified = Boolean(restoration);
    failure.modalRollbackRestoration = restoration;
    failure.modalReleaseSecretAbsent = releaseSecretAbsent;
    throw failure;
  }
}

export async function orchestrateAliceModalEmergencyRollback({
  anchor,
  evidence,
  journal,
  operations,
  observedAt = new Date().toISOString(),
}) {
  if (
    !canonicalIsoTimestamp(observedAt) ||
    !object(operations) ||
    !["captureCurrentLayout", "rollbackTo", "captureEnforcedCurrentLayout",
      "findReleaseSecretByName", "cleanupReleaseSecret"]
      .every((name) => typeof operations[name] === "function")
  ) {
    invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
  }
  let release;
  let expectedTerminalProviderVersion;
  let expectedRollbackProviderVersion;
  let expectedCandidateGraphSha256;
  let releaseSecretObject;
  let recoveryMode;
  const verifiedJournal = verifyAliceModalMutationJournal(journal, { anchor });
  const verifiedAnchor = verifyAliceModalSafeRollbackAnchor(anchor, {
    release: verifiedJournal.release,
  });
  const previous = verifyAliceModalRollbackAnchorLayout(
    verifiedAnchor.previous,
  );
  if (evidence !== null && evidence !== undefined) {
    if (
      !exactKeys(evidence, [
        "schemaVersion",
        "observedAt",
        "release",
        "previousProviderVersion",
        "candidateProviderVersion",
        "terminalProviderVersion",
        "candidateProvider",
        "candidateRuntime",
        "rollbackForwardProof",
        "providerReadback",
      "terminalRuntime",
      "releaseSecretObject",
      ]) ||
      evidence.schemaVersion !== "alice.modal-promotion-evidence.v1" ||
      !canonicalIsoTimestamp(evidence.observedAt) ||
      !validRelease(evidence.release)
    ) {
      invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
    }
    const proof = evidence.rollbackForwardProof;
    const terminal = evidence.providerReadback;
    if (
      anchor.sourceCommit !== evidence.release.sourceCommit ||
      anchor.deploymentManifestSha256 !==
        evidence.release.deploymentManifestSha256 ||
      anchor.appId !== previous.appId ||
      previous.providerVersion !== evidence.previousProviderVersion ||
      !object(proof) ||
      proof.schemaVersion !== "alice.modal-rollback-forward-proof.v1" ||
      proof.previousProviderVersion !== previous.providerVersion ||
      proof.candidateProviderVersion !== evidence.candidateProviderVersion ||
      proof.forwardProviderVersion !== evidence.terminalProviderVersion ||
      proof.previousGraphSha256 !== digestAliceModalProviderGraph(previous) ||
      !DIGEST.test(proof.candidateGraphSha256 ?? "") ||
      !object(terminal) ||
      terminal.appId !== previous.appId ||
      terminal.providerVersion !== evidence.terminalProviderVersion ||
      terminal.rollbackProviderVersion !== evidence.candidateProviderVersion ||
      terminal.sourceCommit !== evidence.release.sourceCommit ||
      terminal.deploymentManifestSha256 !==
        evidence.release.deploymentManifestSha256 ||
      !validReleaseSecretObject(
        evidence.releaseSecretObject,
        verifiedJournal.secretName,
      )
    ) {
      invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
    }
    release = evidence.release;
    expectedTerminalProviderVersion = evidence.terminalProviderVersion;
    expectedRollbackProviderVersion = evidence.candidateProviderVersion;
    expectedCandidateGraphSha256 = proof.candidateGraphSha256;
    releaseSecretObject = evidence.releaseSecretObject;
    recoveryMode = "promotion-evidence";
  } else {
    release = verifiedJournal.release;
    recoveryMode = "predeploy-journal";
  }

  const inventoriedReleaseSecret = await operations.findReleaseSecretByName(
    verifiedJournal.secretName,
  );
  if (
    inventoriedReleaseSecret !== null &&
    !validReleaseSecretObject(
      inventoriedReleaseSecret,
      verifiedJournal.secretName,
    )
  ) {
    invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
  }
  if (
    releaseSecretObject &&
    inventoriedReleaseSecret &&
    canonicalAliceJson(releaseSecretObject) !==
      canonicalAliceJson(inventoriedReleaseSecret)
  ) {
    invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
  }
  releaseSecretObject = inventoriedReleaseSecret;
  const current = verifyAliceModalRollbackAnchorLayout(
    await operations.captureCurrentLayout(),
  );
  const head = current.providerHistory[0];
  const recovered = async (restoration, failedCandidateProviderVersion) => {
    let releaseSecretCleanup = "verified-absent-provider-inventory";
    if (releaseSecretObject) {
      await operations.cleanupReleaseSecret(releaseSecretObject);
      releaseSecretCleanup = "deleted-exact-provider-object";
    }
    return {
      schemaVersion: "alice.modal-emergency-rollback-evidence.v1",
      observedAt,
      release,
      recoveryMode,
      failedCandidateProviderVersion,
      restoration,
      releaseSecretCleanup,
    };
  };
  if (canonicalAliceJson(current) === canonicalAliceJson(previous)) {
    return recovered({
        schemaVersion: "alice.modal-no-mutation-proof.v1",
        appId: previous.appId,
        providerVersion: previous.providerVersion,
        graphSha256: digestAliceModalProviderGraph(previous),
      }, previous.providerVersion);
  }
  try {
    const restoration = verifyAliceModalProviderRestoration({
      expected: previous,
      restored: current,
    });
    return recovered(restoration, current.providerVersion);
  } catch {
    // A non-restored graph must be the exact release attempted by this journal.
  }
  if (
    current.appId !== previous.appId ||
    current.providerVersion <= previous.providerVersion ||
    head.clientVersion !== "1.5.4" ||
    head.commitHash !== release.sourceCommit ||
    head.dirty !== false ||
    (expectedTerminalProviderVersion !== undefined &&
      (current.providerVersion !== expectedTerminalProviderVersion ||
        head.rollbackVersion !== expectedRollbackProviderVersion ||
        current.autoscalerEnforcement.status !== "provider-enforced" ||
        digestAliceModalProviderGraph(current) !==
          expectedCandidateGraphSha256))
  ) {
    invalid("ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID");
  }

  await operations.rollbackTo(previous.providerVersion, current.providerVersion);
  const restored = await operations.captureEnforcedCurrentLayout();
  const restoration = verifyAliceModalProviderRestoration({
    expected: previous,
    restored,
  });
  if (restored.providerVersion <= current.providerVersion) {
    invalid("ALICE_MODAL_ROLLBACK_PROOF_INVALID");
  }
  return recovered(restoration, current.providerVersion);
}

async function waitForRuntime({ release, modalProxyKey, modalProxySecret, apiToken }) {
  let lastError;
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    try {
      return await verifyAliceModalRuntimeHttp({
        release,
        modalProxyKey,
        modalProxySecret,
        apiToken,
        fetchImpl: (url, init = {}) => fetch(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(30_000),
        }),
      });
    } catch (error) {
      lastError = error;
      if (
        !["ALICE_MODAL_LIVENESS_INVALID", "ALICE_MODAL_READINESS_INVALID"]
          .includes(error instanceof Error ? error.message : "") ||
        attempt === 16
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  throw lastError ?? new Error("ALICE_MODAL_READINESS_INVALID");
}

async function main() {
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
  const admissionPath = process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const runtimeTokenPath = process.env.ALICE_RUNTIME_RELEASE_TOKEN_FILE;
  const rollbackAnchorPath = process.env.ALICE_MODAL_ROLLBACK_ANCHOR_PATH;
  const mutationJournalPath = process.env.ALICE_MODAL_MUTATION_JOURNAL_PATH;
  const evidencePath = process.env.ALICE_MODAL_PROMOTION_EVIDENCE_PATH;
  const modalBin = process.env.ALICE_MODAL_BIN;
  const pythonBin = process.env.ALICE_MODAL_PYTHON_BIN;
  const phase = process.env.ALICE_MODAL_PROMOTION_PHASE;
  if (
    ![
      sourceRoot,
      manifestPath,
      admissionPath,
      runtimeTokenPath,
      rollbackAnchorPath,
      mutationJournalPath,
      evidencePath,
      modalBin,
      pythonBin,
    ].every(absolute) ||
    !["capture", "promote"].includes(phase)
  ) {
    invalid();
  }

  const serializedManifest = fs.readFileSync(manifestPath, "utf8");
  const manifest = verifyAliceDeploymentManifest(serializedManifest);
  const deploymentManifestSha256 =
    digestAliceDeploymentManifest(serializedManifest);
  const release = exactReleaseFromEvidence(
    readJson(admissionPath),
    manifest,
    deploymentManifestSha256,
  );
  if (
    !COMMIT.test(release.sourceCommit) ||
    process.env.ALICE_PRODUCTION_RELEASE_CONFIRM !==
      `${release.sourceCommit}:${deploymentManifestSha256}`
  ) {
    invalid("ALICE_PRODUCTION_RELEASE_CONFIRM_INVALID");
  }
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
  const dirty = run(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: sourceRoot, env: process.env, code: "ALICE_MODAL_SOURCE_INVALID" },
  );
  if (
    head !== release.sourceCommit ||
    branch !== PROTECTED_BRANCH ||
    dirty !== "" ||
    (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== head)
  ) {
    invalid("ALICE_MODAL_SOURCE_INVALID");
  }

  const secretName = process.env.ALICE_MODAL_RELEASE_SECRET_NAME;
  const releaseRunId = process.env.ALICE_RELEASE_RUN_ID;
  if (
    !/^[1-9][0-9]*-[1-9][0-9]*$/.test(releaseRunId ?? "") ||
    secretName !==
      `alice-production-core-${release.releaseDigest.slice("sha256:".length)}` +
      `-${releaseRunId}`
  ) {
    invalid("ALICE_MODAL_SECRET_INVALID");
  }

  const commandEnv = aliceModalCommandEnv(process.env);
  const commandSet = buildAliceModalReleaseCommands({
    modalBin,
    pythonBin,
    sourceRoot,
    secretName,
    secretJsonPath: path.join(os.tmpdir(), "placeholder-alice-secret.json"),
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256,
    modalRevision: release.modalRevision,
  });
  const versionOutput = run(modalBin, commandSet.version, {
    cwd: sourceRoot,
    env: commandEnv,
    code: "ALICE_MODAL_VERSION_INVALID",
  });
  if (versionOutput.trim() !== `modal client version: ${MODAL_VERSION}`) {
    invalid("ALICE_MODAL_VERSION_INVALID");
  }
  const captureJson = (argv, code) => parseJson(run(pythonBin, argv, {
    cwd: sourceRoot,
    env: commandEnv,
    code,
  }), code);
  if (phase === "capture") {
    verifyProtectedRefStillExact({
      sourceRoot,
      sourceCommit: release.sourceCommit,
    });
    const persistedAnchor = verifyAliceModalSafeRollbackAnchor(
      readJson(rollbackAnchorPath),
      { release },
    );
    const previous = verifyAliceModalRollbackAnchorLayout(captureJson(
      commandSet.providerSafeBootstrap,
      "ALICE_MODAL_PROVIDER_READBACK_INVALID",
    ));
    if (
      persistedAnchor.sourceCommit !== release.sourceCommit ||
      persistedAnchor.deploymentManifestSha256 !== deploymentManifestSha256 ||
      persistedAnchor.appId !== previous.appId ||
      canonicalAliceJson(persistedAnchor.previous) !== canonicalAliceJson(previous)
    ) {
      invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
    }
    const currentSecretNames = secretInventory(run(
      pythonBin,
      commandSet.providerSecretInventory,
      {
        cwd: sourceRoot,
        env: commandEnv,
        code: "ALICE_MODAL_SECRET_INVENTORY_INVALID",
      },
    )).map((item) => item.name);
    if (currentSecretNames.includes(secretName)) {
      invalid("ALICE_MODAL_RELEASE_SECRET_ALREADY_EXISTS");
    }
    const journal = {
      schemaVersion: "alice.modal-mutation-journal.v1",
      observedAt: new Date().toISOString(),
      phase: "predeploy",
      release,
      secretName,
      appId: previous.appId,
      previousProviderVersion: previous.providerVersion,
      previousGraphSha256: digestAliceModalProviderGraph(previous),
      releaseSecretAbsent: true,
    };
    verifyAliceModalMutationJournal(journal, { anchor: persistedAnchor });
    writeReadonly(mutationJournalPath, journal);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase,
      appId: previous.appId,
      previousProviderVersion: previous.providerVersion,
      deploymentManifestSha256,
    })}\n`);
    return;
  }

  const persistedAnchor = verifyAliceModalSafeRollbackAnchor(
    readJson(rollbackAnchorPath),
    { release },
  );
  const persistedJournal = verifyAliceModalMutationJournal(
    readJson(mutationJournalPath),
    { anchor: persistedAnchor },
  );
  const runtimeToken = readSecretFile(runtimeTokenPath);
  const builtSecret = buildAliceModalReleaseSecret({
    release,
    releaseRunId,
    scoped: {
      MILADY_API_TOKEN: process.env.MILADY_API_TOKEN,
      OPENAI_API_KEY: runtimeToken,
      MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
        process.env.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET,
      ELIZA_VAULT_PASSPHRASE: process.env.ELIZA_VAULT_PASSPHRASE,
    },
  });
  if (builtSecret.name !== secretName) invalid("ALICE_MODAL_SECRET_INVALID");
  const initialSecretInventory = secretInventory(run(
    pythonBin,
    commandSet.providerSecretInventory,
    {
      cwd: sourceRoot,
      env: commandEnv,
      code: "ALICE_MODAL_SECRET_INVENTORY_INVALID",
    },
  ));
  if (initialSecretInventory.some((item) => item.name === secretName)) {
    invalid("ALICE_MODAL_RELEASE_SECRET_ALREADY_EXISTS");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-modal-release."));
  fs.chmodSync(tempRoot, 0o700);
  const secretJsonPath = path.join(tempRoot, "release-secret.json");
  fs.writeFileSync(secretJsonPath, JSON.stringify(builtSecret.values), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const commands = buildAliceModalReleaseCommands({
    modalBin,
    pythonBin,
    sourceRoot,
    secretName,
    secretJsonPath,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256,
    modalRevision: release.modalRevision,
  });

  let previousProviderVersion;
  let candidateProviderVersion;
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
  const readReleaseState = async () => {
    let lastState;
    for (let attempt = 1; attempt <= 19; attempt += 1) {
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
          commands.providerReadback,
          "ALICE_MODAL_PROVIDER_READBACK_INVALID",
        ),
      };
      lastState = state;
      if (Array.isArray(state.containers) && state.containers.length === 0) {
        if (candidateProviderVersion === undefined) {
          candidateProviderVersion = state.layout.providerVersion;
        }
        return state;
      }
      if (attempt < 19) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
    return lastState;
  };
  const operations = {
    captureCurrentLayout: async () => pythonJson(
      commands.providerEnforceCurrent,
      "ALICE_MODAL_PROVIDER_READBACK_INVALID",
    ),
    persistRollbackAnchor: async (previous) => {
      previousProviderVersion = previous.providerVersion;
      if (
        persistedAnchor.sourceCommit !== release.sourceCommit ||
        persistedAnchor.deploymentManifestSha256 !== deploymentManifestSha256 ||
        canonicalAliceJson(persistedAnchor.previous) !==
          canonicalAliceJson(previous)
      ) invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
    },
    persistMutationJournal: async (journal) => {
      if (canonicalAliceJson(journal) !== canonicalAliceJson(persistedJournal)) {
        invalid("ALICE_MODAL_MUTATION_JOURNAL_INVALID");
      }
    },
    verifyProtectedRef: async () => verifyProtectedRefStillExact({
      sourceRoot,
      sourceCommit: release.sourceCommit,
    }),
    createReleaseSecret: async () => {
      run(modalBin, commands.createSecret, {
        cwd: sourceRoot,
        env: commandEnv,
        code: "ALICE_MODAL_SECRET_CREATE_FAILED",
      });
      const current = secretInventory(run(
        pythonBin,
        commands.providerSecretInventory,
        {
          cwd: sourceRoot,
          env: commandEnv,
          code: "ALICE_MODAL_SECRET_INVENTORY_INVALID",
        },
      ));
      const created = current.filter((item) => item.name === builtSecret.name);
      if (
        created.length !== 1 ||
        current.length !== initialSecretInventory.length + 1 ||
        canonicalAliceJson(
          current.filter((item) => item.name !== builtSecret.name),
        ) !== canonicalAliceJson(initialSecretInventory)
      ) {
        invalid("ALICE_MODAL_SECRET_CREATE_FAILED");
      }
      return created[0];
    },
    cleanupReleaseSecret: async (created) => {
      if (!validReleaseSecretObject(created, builtSecret.name)) {
        invalid("ALICE_MODAL_SECRET_DELETE_FAILED");
      }
      const deleteCommand = [
        commands.providerSecretInventory[0],
        "--delete-secret",
        created.name,
        created.id,
      ];
      const deleted = pythonJson(
        deleteCommand,
        "ALICE_MODAL_SECRET_DELETE_FAILED",
      );
      if (
        deleted.deleted !== true ||
        deleted.id !== created.id ||
        deleted.name !== created.name
      ) {
        invalid("ALICE_MODAL_SECRET_DELETE_FAILED");
      }
      const current = secretInventory(run(
        pythonBin,
        commands.providerSecretInventory,
        {
          cwd: sourceRoot,
          env: commandEnv,
          code: "ALICE_MODAL_SECRET_INVENTORY_INVALID",
        },
      ));
      if (current.some((item) => item.name === builtSecret.name)) {
        invalid("ALICE_MODAL_SECRET_DELETE_FAILED");
      }
    },
    deployCandidate: async () => {
      run(modalBin, commands.deploy, {
        cwd: sourceRoot,
        env: commandEnv,
        code: "ALICE_MODAL_DEPLOY_FAILED",
      });
    },
    readReleaseState,
    verifyRuntime: async () => waitForRuntime({
      release,
      modalProxyKey: process.env.ALICE_MODAL_PROXY_KEY,
      modalProxySecret: process.env.ALICE_MODAL_PROXY_SECRET,
      apiToken: process.env.MILADY_API_TOKEN,
    }),
    rollbackTo: async (providerVersion, observedProviderVersion) => {
      if (Number.isSafeInteger(observedProviderVersion)) {
        candidateProviderVersion = observedProviderVersion;
      }
      if (
        providerVersion === previousProviderVersion &&
        !Number.isSafeInteger(candidateProviderVersion)
      ) {
        const current = pythonJson(
          commands.providerEnforceCurrent,
          "ALICE_MODAL_PROVIDER_READBACK_INVALID",
        );
        if (
          current.appId === undefined ||
          !Number.isSafeInteger(current.providerVersion) ||
          current.providerVersion <= previousProviderVersion
        ) {
          invalid("ALICE_MODAL_PROVIDER_VERSION_INVALID");
        }
        candidateProviderVersion = current.providerVersion;
      }
      if (
        !Number.isSafeInteger(previousProviderVersion) ||
        !Number.isSafeInteger(candidateProviderVersion)
      ) {
        invalid("ALICE_MODAL_PROVIDER_VERSION_INVALID");
      }
      const rollback = buildAliceModalRollbackCommands({
        previousProviderVersion,
        candidateProviderVersion,
      });
      const argv = providerVersion === previousProviderVersion
        ? rollback.rollback
        : providerVersion === candidateProviderVersion
          ? rollback.forward
          : null;
      if (!argv) invalid("ALICE_MODAL_PROVIDER_VERSION_INVALID");
      run(modalBin, argv, {
        cwd: sourceRoot,
        env: commandEnv,
        code: "ALICE_MODAL_ROLLBACK_FAILED",
      });
    },
    captureEnforcedCurrentLayout: async () => pythonJson(
      commands.providerEnforceCurrent,
      "ALICE_MODAL_PROVIDER_READBACK_INVALID",
    ),
  };
  try {
    const evidence = await orchestrateAliceModalPromotion({
      release,
      secretName,
      operations,
      observedAt: persistedJournal.observedAt,
    });
    writeReadonly(evidencePath, evidence);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      appId: evidence.providerReadback.appId,
      providerVersion: evidence.providerReadback.providerVersion,
      deploymentManifestSha256,
    })}\n`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
