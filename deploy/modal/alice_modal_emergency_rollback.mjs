import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import {
  orchestrateAliceModalEmergencyRollback,
} from "./alice_modal_promote.mjs";
import {
  aliceModalCommandEnv,
  buildAliceModalReleaseCommands,
  buildAliceModalRollbackCommands,
} from "./alice_modal_release.mjs";

const PROTECTED_BRANCH = "release/alice-production-core-2026-08-22";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SECRET_ID = /^st-[A-Za-z0-9]{20,32}$/;

function invalid(code = "ALICE_MODAL_EMERGENCY_ROLLBACK_INVALID") {
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
    if (error instanceof Error && error.message.startsWith("ALICE_")) {
      throw error;
    }
    invalid();
  }
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    invalid(code);
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

async function main() {
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const anchorPath = process.env.ALICE_MODAL_ROLLBACK_ANCHOR_PATH;
  const promotionEvidencePath =
    process.env.ALICE_MODAL_PROMOTION_EVIDENCE_PATH;
  const mutationJournalPath =
    process.env.ALICE_MODAL_MUTATION_JOURNAL_PATH;
  const rollbackEvidencePath =
    process.env.ALICE_MODAL_EMERGENCY_ROLLBACK_EVIDENCE_PATH;
  const modalBin = process.env.ALICE_MODAL_BIN;
  const pythonBin = process.env.ALICE_MODAL_PYTHON_BIN;
  if (![sourceRoot, anchorPath, promotionEvidencePath, mutationJournalPath,
    rollbackEvidencePath,
    modalBin, pythonBin].every(absolute)) {
    invalid();
  }

  const anchor = readJson(anchorPath);
  const evidence = fs.existsSync(promotionEvidencePath)
    ? readJson(promotionEvidencePath)
    : null;
  const journal = readJson(mutationJournalPath);
  const release = evidence?.release ?? journal?.release;
  if (
    !COMMIT.test(release?.sourceCommit ?? "") ||
    !DIGEST.test(release?.deploymentManifestSha256 ?? "") ||
    !Number.isSafeInteger(release?.modalRevision) ||
    !new RegExp(
      `^alice-production-core-${release?.releaseDigest?.slice("sha256:".length)}` +
      "-[1-9][0-9]*-[1-9][0-9]*$",
    ).test(process.env.ALICE_MODAL_RELEASE_SECRET_NAME ?? "") ||
    process.env.ALICE_MODAL_REVISION !== String(release.modalRevision) ||
    process.env.ALICE_RUNTIME_IMAGE !== release.runtimeImage
  ) {
    invalid();
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
  if (
    head !== release.sourceCommit ||
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

  const commandEnv = aliceModalCommandEnv(process.env);
  const commands = buildAliceModalReleaseCommands({
    modalBin,
    pythonBin,
    sourceRoot,
    secretName: process.env.ALICE_MODAL_RELEASE_SECRET_NAME,
    secretJsonPath: path.join(sourceRoot, ".alice-unused-secret.json"),
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    modalRevision: release.modalRevision,
  });
  if (run(modalBin, commands.version, {
    cwd: sourceRoot,
    env: commandEnv,
    code: "ALICE_MODAL_VERSION_INVALID",
  }).trim() !== "modal client version: 1.5.4") {
    invalid("ALICE_MODAL_VERSION_INVALID");
  }
  const pythonJson = (argv) => parseJson(run(pythonBin, argv, {
    cwd: sourceRoot,
    env: commandEnv,
    code: "ALICE_MODAL_PROVIDER_READBACK_INVALID",
  }), "ALICE_MODAL_PROVIDER_READBACK_INVALID");

  const result = await orchestrateAliceModalEmergencyRollback({
    anchor,
    evidence,
    journal,
    operations: {
      findReleaseSecretByName: async (name) => {
        const inventory = parseJson(run(pythonBin, commands.providerSecretInventory, {
          cwd: sourceRoot,
          env: commandEnv,
          code: "ALICE_MODAL_SECRET_INVENTORY_INVALID",
        }), "ALICE_MODAL_SECRET_INVENTORY_INVALID");
        if (
          !Array.isArray(inventory) ||
          inventory.some((item) =>
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            Object.keys(item).sort().join(",") !== "id,name" ||
            !SECRET_ID.test(item.id ?? "") ||
            typeof item.name !== "string" ||
            !/^[a-z0-9][a-z0-9-]{2,127}$/.test(item.name)) ||
          new Set(inventory.map((item) => item.id)).size !== inventory.length ||
          new Set(inventory.map((item) => item.name)).size !== inventory.length
        ) {
          invalid("ALICE_MODAL_SECRET_INVENTORY_INVALID");
        }
        const matches = inventory.filter((item) => item.name === name);
        if (matches.length > 1) invalid("ALICE_MODAL_SECRET_INVENTORY_INVALID");
        return matches[0] ?? null;
      },
      captureCurrentLayout: async () => pythonJson(
        commands.providerEnforceCurrent,
      ),
      rollbackTo: async (previousProviderVersion, currentProviderVersion) => {
        const rollback = buildAliceModalRollbackCommands({
          previousProviderVersion,
          candidateProviderVersion: currentProviderVersion,
        });
        run(modalBin, rollback.rollback, {
          cwd: sourceRoot,
          env: commandEnv,
          code: "ALICE_MODAL_ROLLBACK_FAILED",
        });
      },
      captureEnforcedCurrentLayout: async () => pythonJson(
        commands.providerEnforceCurrent,
      ),
      cleanupReleaseSecret: async (created) => {
        if (
          !created ||
          !/^st-[A-Za-z0-9]{20,32}$/.test(created.id ?? "") ||
          created.name !== process.env.ALICE_MODAL_RELEASE_SECRET_NAME
        ) {
          invalid("ALICE_MODAL_SECRET_DELETE_FAILED");
        }
        const deleted = parseJson(run(pythonBin, [
          commands.providerSecretInventory[0],
          "--delete-secret",
          created.name,
          created.id,
        ], {
          cwd: sourceRoot,
          env: commandEnv,
          code: "ALICE_MODAL_SECRET_DELETE_FAILED",
        }), "ALICE_MODAL_SECRET_DELETE_FAILED");
        if (
          deleted.deleted !== true ||
          deleted.id !== created.id ||
          deleted.name !== created.name
        ) {
          invalid("ALICE_MODAL_SECRET_DELETE_FAILED");
        }
      },
    },
  });
  writeReadonly(rollbackEvidencePath, result);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    appId: result.restoration.appId,
    restorationProviderVersion:
      result.restoration.restorationProviderVersion,
    deploymentManifestSha256: result.release.deploymentManifestSha256,
  })}\n`);
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
