import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  aliceCloudflareCommandEnv,
} from "./alice_cloudflare_release.mjs";
import { verifyAliceBootstrapState } from "./alice_cloudflare_bootstrap.mjs";

const SECRET_NAME = "ALICE_CONTROL_RECOVERY_TOKEN";
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function invalid() {
  throw new Error("ALICE_RECOVERY_PREPROVISION_INVALID");
}

export function buildAliceRecoveryPreprovisionCommands({
  wranglerBin,
  configPath,
  sourceCommit,
}) {
  if (
    typeof wranglerBin !== "string" ||
    !path.isAbsolute(wranglerBin) ||
    typeof configPath !== "string" ||
    !path.isAbsolute(configPath) ||
    !/^[a-f0-9]{40}$/.test(sourceCommit ?? "")
  ) {
    invalid();
  }
  return {
    put: [
      "versions",
      "secret",
      "put",
      SECRET_NAME,
      "--config",
      configPath,
      "--tag",
      `alice-recovery-boundary-${sourceCommit}`,
      "--message",
      `Alice protected recovery boundary ${sourceCommit}`,
    ],
    list: [
      "versions",
      "secret",
      "list",
      "--config",
      configPath,
      "--latest-version",
    ],
  };
}

export function parseAliceRecoveryVersionId(output) {
  if (typeof output !== "string") invalid();
  const matches = [
    ...output.matchAll(/Success! Created version ([a-f0-9-]+) with secret ALICE_CONTROL_RECOVERY_TOKEN\./g),
  ];
  if (matches.length !== 1 || !VERSION_ID.test(matches[0][1] ?? "")) invalid();
  return matches[0][1];
}

export function buildAliceRecoveryBootstrapPromotionCommand({
  versionId,
  configPath,
}) {
  if (!VERSION_ID.test(versionId ?? "") || !path.isAbsolute(configPath ?? "")) {
    invalid();
  }
  return [
    "versions",
    "deploy",
    "--config",
    configPath,
    "--version-id",
    versionId,
    "--percentage",
    "100",
    "--message",
    "Alice fail-closed recovery bootstrap",
    "--yes",
  ];
}

function versionViewCommand({ versionId, configPath }) {
  if (!VERSION_ID.test(versionId ?? "") || !path.isAbsolute(configPath ?? "")) {
    invalid();
  }
  return [
    "versions",
    "view",
    versionId,
    "--config",
    configPath,
    "--json",
  ];
}

function deploymentStatusCommand(configPath) {
  if (!path.isAbsolute(configPath ?? "")) invalid();
  return ["deployments", "status", "--config", configPath, "--json"];
}

function parsedJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    invalid();
  }
}

function versionHasRecoverySecret(version, expectedVersionId) {
  const bindings = version?.resources?.bindings;
  if (version?.id !== expectedVersionId || !Array.isArray(bindings)) invalid();
  const matches = bindings.filter(
    (binding) =>
      binding?.name === SECRET_NAME && binding?.type === "secret_text",
  );
  if (matches.length > 1) invalid();
  return matches.length === 1;
}

function assertActiveVersion(deployment, expectedVersionId) {
  if (
    !Array.isArray(deployment?.versions) ||
    deployment.versions.length !== 1 ||
    deployment.versions[0]?.version_id !== expectedVersionId ||
    deployment.versions[0]?.percentage !== 100
  ) {
    invalid();
  }
}

function run(binary, argv, { cwd, env, input }) {
  const execution = spawnSync(binary, argv, {
    cwd,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (execution.error || execution.status !== 0) invalid();
  return execution.stdout;
}

function main() {
  const wranglerBin = process.env.ALICE_WRANGLER_BIN;
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const configPath = process.env.ALICE_BOOTSTRAP_CONTROL_CONFIG_PATH;
  const statePath = process.env.ALICE_BOOTSTRAP_STATE_PATH;
  const sourceCommit = process.env.ALICE_SOURCE_COMMIT;
  const recoveryToken = process.env[SECRET_NAME];
  if (
    typeof sourceRoot !== "string" ||
    !path.isAbsolute(sourceRoot) ||
    typeof configPath !== "string" ||
    !path.isAbsolute(configPath) ||
    !fs.lstatSync(configPath).isFile() ||
    typeof statePath !== "string" ||
    !path.isAbsolute(statePath) ||
    !fs.lstatSync(statePath).isFile()
  ) {
    invalid();
  }
  const state = verifyAliceBootstrapState(
    parsedJson(fs.readFileSync(statePath, "utf8")),
  );
  const commandEnv = aliceCloudflareCommandEnv();
  const activeView = parsedJson(
    run(wranglerBin, versionViewCommand({
      versionId: state.activeVersionId,
      configPath,
    }), { cwd: sourceRoot, env: commandEnv }),
  );
  const alreadyProvisioned = versionHasRecoverySecret(
    activeView,
    state.activeVersionId,
  );
  if (alreadyProvisioned) {
    assertActiveVersion(
      parsedJson(
        run(wranglerBin, deploymentStatusCommand(configPath), {
          cwd: sourceRoot,
          env: commandEnv,
        }),
      ),
      state.activeVersionId,
    );
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        recoverySecretName: SECRET_NAME,
        recoveryVersionId: state.activeVersionId,
        recoveryVersionPromoted: true,
        latestVersionBindingVerified: true,
        secretValueExposed: false,
        mutationPerformed: false,
      })}\n`,
    );
    return;
  }
  if (
    state.mode !== "bootstrap" ||
    typeof recoveryToken !== "string" ||
    recoveryToken.length < 32 ||
    /[\r\n]/.test(recoveryToken)
  ) {
    invalid();
  }
  const commands = buildAliceRecoveryPreprovisionCommands({
    wranglerBin,
    configPath,
    sourceCommit,
  });
  const putOutput = run(wranglerBin, commands.put, {
    cwd: sourceRoot,
    env: commandEnv,
    input: `${recoveryToken}\n`,
  });
  const recoveryVersionId = parseAliceRecoveryVersionId(putOutput);
  const list = run(wranglerBin, commands.list, {
    cwd: sourceRoot,
    env: commandEnv,
  });
  const occurrences = list.match(new RegExp(`\\b${SECRET_NAME}\\b`, "g")) ?? [];
  if (occurrences.length !== 1) invalid();
  const recoveryView = parsedJson(
    run(wranglerBin, versionViewCommand({
      versionId: recoveryVersionId,
      configPath,
    }), { cwd: sourceRoot, env: commandEnv }),
  );
  if (!versionHasRecoverySecret(recoveryView, recoveryVersionId)) invalid();
  run(
    wranglerBin,
    buildAliceRecoveryBootstrapPromotionCommand({
      versionId: recoveryVersionId,
      configPath,
    }),
    { cwd: sourceRoot, env: commandEnv },
  );
  assertActiveVersion(
    parsedJson(
      run(wranglerBin, deploymentStatusCommand(configPath), {
        cwd: sourceRoot,
        env: commandEnv,
      }),
    ),
    recoveryVersionId,
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      recoverySecretName: SECRET_NAME,
      latestVersionBindingVerified: true,
      recoveryVersionId,
      recoveryVersionPromoted: true,
      secretValueExposed: false,
      mutationPerformed: true,
    })}\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
