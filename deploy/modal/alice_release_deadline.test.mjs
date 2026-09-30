import assert from "node:assert/strict";
import test from "node:test";

import {
  aliceReleasePhaseBudget,
  initializeAliceReleaseDeadlines,
} from "./alice_release_deadline.mjs";

test("reserves an exact sixty-minute provider recovery window before cleanup", () => {
  const deadlines = initializeAliceReleaseDeadlines(1_800_000_000);
  assert.deepEqual(deadlines, {
    mutationCutoffEpoch: 1_800_009_000,
    recoveryDeadlineEpoch: 1_800_012_600,
  });
  assert.equal(
    deadlines.recoveryDeadlineEpoch - deadlines.mutationCutoffEpoch,
    60 * 60,
  );
});

test("bounds every normal mutation by the shared cutoff", () => {
  const deadlines = initializeAliceReleaseDeadlines(1_800_000_000);
  assert.equal(aliceReleasePhaseBudget({
    phase: "mutation",
    nowSeconds: 1_800_000_000,
    ...deadlines,
  }), 1_800);
  assert.equal(aliceReleasePhaseBudget({
    phase: "mutation",
    nowSeconds: deadlines.mutationCutoffEpoch - 61,
    ...deadlines,
  }), 61);
  assert.throws(() => aliceReleasePhaseBudget({
    phase: "mutation",
    nowSeconds: deadlines.mutationCutoffEpoch - 59,
    ...deadlines,
  }), /ALICE_RELEASE_DEADLINE_EXHAUSTED/);
});

test("budgets six application rollouts without consuming recovery", () => {
  const deadlines = initializeAliceReleaseDeadlines(1_800_000_000);
  assert.equal(aliceReleasePhaseBudget({ phase: "cloudflare-promotion",
    nowSeconds: 1_800_000_600, ...deadlines }), 8_400);
  assert.ok(aliceReleasePhaseBudget({ phase: "cloudflare-promotion",
    nowSeconds: 1_800_000_600, ...deadlines }) > 6 * 20 * 60);
  assert.equal(aliceReleasePhaseBudget({ phase: "cloudflare-promotion",
    nowSeconds: deadlines.mutationCutoffEpoch - 61, ...deadlines }), 61);
  assert.throws(() => aliceReleasePhaseBudget({ phase: "cloudflare-promotion",
    nowSeconds: deadlines.mutationCutoffEpoch - 59, ...deadlines }),
  /ALICE_RELEASE_DEADLINE_EXHAUSTED/);
});

test("partitions rollback into independent Modal and Cloudflare windows", () => {
  const deadlines = initializeAliceReleaseDeadlines(1_800_000_000);
  assert.equal(aliceReleasePhaseBudget({
    phase: "modal-recovery",
    nowSeconds: deadlines.mutationCutoffEpoch,
    ...deadlines,
  }), 900);
  assert.throws(() => aliceReleasePhaseBudget({
    phase: "modal-recovery",
    nowSeconds: deadlines.mutationCutoffEpoch + 841,
    ...deadlines,
  }), /ALICE_RELEASE_DEADLINE_EXHAUSTED/);
  assert.equal(aliceReleasePhaseBudget({
    phase: "cloudflare-recovery",
    nowSeconds: deadlines.mutationCutoffEpoch + 900,
    ...deadlines,
  }), 2_700);
  assert.throws(() => aliceReleasePhaseBudget({
    phase: "cloudflare-recovery",
    nowSeconds: deadlines.recoveryDeadlineEpoch - 59,
    ...deadlines,
  }), /ALICE_RELEASE_DEADLINE_EXHAUSTED/);
});
