import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAliceRecoveryBootstrapPromotionCommand,
  buildAliceRecoveryPreprovisionCommands,
  parseAliceRecoveryVersionId,
} from "./alice_cloudflare_recovery_preprovision.mjs";
import { verifyAliceBootstrapState } from "./alice_cloudflare_bootstrap.mjs";

const bootstrapState = {
  schemaVersion: "alice.cloudflare-bootstrap-state.v2",
  mode: "bootstrap",
  activeVersionId: "11111111-1111-4111-8111-111111111111",
  preexisting: {
    accessWorker: false,
    runtimeHostWorker: false,
    statePlaneWorker: false,
    connectorPlaneWorker: false,
    evidenceQueue: false,
    evidenceDeadLetterQueue: false,
    evidenceBucket: false,
    evidenceSentinel: false,
    evidenceQueueConsumer: false,
  },
  createdByRun: {
    accessWorker: true,
    runtimeHostWorker: true,
    statePlaneWorker: true,
    connectorPlaneWorker: true,
    controlWorker: true,
    evidenceQueue: true,
    evidenceDeadLetterQueue: true,
    evidenceBucket: true,
    evidenceSentinel: true,
    evidenceQueueConsumer: true,
  },
};

test("accepts the exact bootstrap state emitted by the preceding protected step", () => {
  assert.deepEqual(verifyAliceBootstrapState(bootstrapState), bootstrapState);
  assert.throws(() => verifyAliceBootstrapState({
    ...bootstrapState,
    createdByRun: { ...bootstrapState.createdByRun, unexpected: false },
  }));
});

test("preprovisions only the recovery secret on an unrouted bootstrap version", () => {
  const sourceCommit = "1".repeat(40);
  const commands = buildAliceRecoveryPreprovisionCommands({
    wranglerBin: "/tools/wrangler",
    configPath: "/release/control.bootstrap.wrangler.json",
    sourceCommit,
  });
  assert.deepEqual(commands.put.slice(0, 4), [
    "versions",
    "secret",
    "put",
    "ALICE_CONTROL_RECOVERY_TOKEN",
  ]);
  assert.ok(commands.put.includes(`alice-recovery-boundary-${sourceCommit}`));
  assert.deepEqual(Object.keys(commands), ["put"]);
});

test("parses and promotes only the recovery-bearing fail-closed version", () => {
  const versionId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    parseAliceRecoveryVersionId(
      `Success! Created version ${versionId} with secret ALICE_CONTROL_RECOVERY_TOKEN.\n`,
    ),
    versionId,
  );
  assert.deepEqual(
    buildAliceRecoveryBootstrapPromotionCommand({
      versionId,
      configPath: "/release/control.bootstrap.wrangler.json",
    }),
    [
      "versions",
      "deploy",
      "--config",
      "/release/control.bootstrap.wrangler.json",
      "--version-id",
      versionId,
      "--percentage",
      "100",
      "--message",
      "Alice fail-closed recovery bootstrap",
      "--yes",
    ],
  );
  assert.throws(() => parseAliceRecoveryVersionId("Created version ambiguous"));
});

test("rejects ambiguous tool, config, and source identities", () => {
  for (const input of [
    {
      wranglerBin: "wrangler",
      configPath: "/release/control.bootstrap.wrangler.json",
      sourceCommit: "1".repeat(40),
    },
    {
      wranglerBin: "/tools/wrangler",
      configPath: "control.json",
      sourceCommit: "1".repeat(40),
    },
    {
      wranglerBin: "/tools/wrangler",
      configPath: "/release/control.bootstrap.wrangler.json",
      sourceCommit: "main",
    },
  ]) {
    assert.throws(() => buildAliceRecoveryPreprovisionCommands(input));
  }
});
