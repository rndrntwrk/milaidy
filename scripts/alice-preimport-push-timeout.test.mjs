import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/alice-cloudflare-container-bringup.yml", import.meta.url),
  "utf8",
);
const watchdogWorkflow = fs.readFileSync(
  new URL("../.github/workflows/recover-alice-production-watchdog.yml", import.meta.url),
  "utf8",
);

function identityRetryLoop(stepName) {
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const step = workflow.match(
    new RegExp(
      `- name: ${escapedName}\\n[\\s\\S]*?\\n        run: \\|\\n([\\s\\S]*?)(?=\\n      - name:)`,
    ),
  )?.[1];
  assert.ok(step, `missing ${stepName} shell step`);
  const shell = step.replace(/^ {10}/gm, "");
  const loop = shell.match(/^snapshot_attempt=1\n[\s\S]*?^done$/m)?.[0];
  assert.ok(loop, `missing bounded identity retry loop in ${stepName}`);
  return loop;
}

function runRetryLoop(loop, failures) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-identity-retry-"));
  const callLog = path.join(tempRoot, "calls");
  const sleepLog = path.join(tempRoot, "sleeps");
  const result = spawnSync(
    "bash",
    [
      "-c",
      `set -euo pipefail
capture_github_identity_snapshot() {
  printf 'call\\n' >> "$CALL_LOG"
  call_count="$(wc -l < "$CALL_LOG" | tr -d ' ')"
  [ "$call_count" -gt "$FAILURES" ]
}
sleep() {
  printf '%s\\n' "$1" >> "$SLEEP_LOG"
}
${loop}`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CALL_LOG: callLog,
        FAILURES: String(failures),
        SLEEP_LOG: sleepLog,
      },
    },
  );
  const calls = fs.existsSync(callLog)
    ? fs.readFileSync(callLog, "utf8").trim().split("\n").length
    : 0;
  const sleeps = fs.existsSync(sleepLog)
    ? fs.readFileSync(sleepLog, "utf8").trim().split("\n").filter(Boolean)
    : [];
  fs.rmSync(tempRoot, { recursive: true, force: true });
  return { ...result, calls, sleeps };
}

test("pre-import reserves enough exact watchdog parent-selection runway before mutation", () => {
  const importJob = workflow.match(
    /\n  import_runtime:[\s\S]*?(?=\n  materialize:)/,
  )?.[0] ?? "";
  const jobTimeout = Number(
    importJob.match(/\n    timeout-minutes:\s*(\d+)/)?.[1],
  );
  const pushTimeout = Number(
    importJob.match(
      /timeout\s+--signal=TERM\s+--kill-after=30s\s+(\d+)s[\s\\]+docker push "\$registry_tag"/,
    )?.[1],
  );
  assert.ok(Number.isInteger(jobTimeout) && jobTimeout >= 60);
  assert.ok(Number.isInteger(pushTimeout) && pushTimeout >= 2400);
  assert.ok(pushTimeout < jobTimeout * 60);
  assert.match(
    importJob,
    /containers registries credentials registry\.cloudflare\.com[\s\\]+--push[\s\\]+--pull[\s\\]+--expiration-minutes 45[\s\\]+--json/,
  );
  assert.match(
    importJob,
    /docker login registry\.cloudflare\.com[\s\\]+--username "\$registry_username"[\s\\]+--password-stdin/,
  );
  assert.doesNotMatch(importJob, /"\$WRANGLER" containers push/);

  const admission = workflow.match(
    /- name: Enforce exact source build watchdog and artifact identity[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(admission, /Select one exact parent deployment/);
  assert.equal(
    [...workflow.matchAll(/watchdog_remaining_seconds=\$\(\( 7200 -/g)].length,
    2,
  );
  assert.match(admission, /MINIMUM_WATCHDOG_RUNWAY_SECONDS:\s*1800/);
  assert.match(
    watchdogWorkflow,
    /for attempt in \$\(seq 1 480\)[\s\S]*?sleep 15/,
  );
  assert.match(
    admission,
    /runs\/\$\{RECOVERY_WATCHDOG_RUN_ID\}\/jobs\?filter=latest/,
  );
  assert.ok(
    workflow.indexOf("MINIMUM_WATCHDOG_RUNWAY_SECONDS: 1800") <
      workflow.indexOf("Import exact once-built image and prove Cloudflare digest"),
  );
});

test("pre-import retries a transient GitHub identity snapshot in both read gates", () => {
  for (const stepName of [
    "Enforce exact source build watchdog and artifact identity",
    "Revalidate exact source build watchdog and artifact identity",
  ]) {
    const result = runRetryLoop(identityRetryLoop(stepName), 1);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls, 2);
    assert.deepEqual(result.sleeps, ["2"]);
    assert.match(result.stderr, /ALICE_PREIMPORT_GITHUB_IDENTITY_RETRY attempt=1\/3/);
  }
});

test("pre-import stops after three invalid GitHub identity snapshots", () => {
  const result = runRetryLoop(
    identityRetryLoop("Enforce exact source build watchdog and artifact identity"),
    99,
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.calls, 3);
  assert.deepEqual(result.sleeps, ["2", "2"]);
  assert.match(
    result.stderr,
    /ALICE_PREIMPORT_GITHUB_IDENTITY_INVALID attempts=3/,
  );
});
