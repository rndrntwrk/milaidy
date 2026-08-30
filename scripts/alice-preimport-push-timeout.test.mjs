import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/alice-cloudflare-container-bringup.yml", import.meta.url),
  "utf8",
);

test("pre-import reserves enough exact watchdog parent-selection runway before mutation", () => {
  const importJob = workflow.match(
    /\n  import_runtime:[\s\S]*?(?=\n  materialize:)/,
  )?.[0] ?? "";
  const jobTimeout = Number(
    importJob.match(/\n    timeout-minutes:\s*(\d+)/)?.[1],
  );
  const pushTimeout = Number(
    importJob.match(
      /timeout\s+--signal=TERM\s+--kill-after=30s\s+(\d+)s[\s\\]+"\$WRANGLER"\s+containers push/,
    )?.[1],
  );
  assert.ok(Number.isInteger(jobTimeout) && jobTimeout >= 60);
  assert.ok(Number.isInteger(pushTimeout) && pushTimeout >= 2400);
  assert.ok(pushTimeout < jobTimeout * 60);

  const admission = workflow.match(
    /- name: Enforce exact source build watchdog and artifact identity[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(admission, /Select one exact parent deployment/);
  assert.match(admission, /5400/);
  assert.match(admission, /MINIMUM_WATCHDOG_RUNWAY_SECONDS:\s*1800/);
  assert.match(
    admission,
    /runs\/\$\{RECOVERY_WATCHDOG_RUN_ID\}\/jobs\?filter=latest/,
  );
  assert.ok(
    workflow.indexOf("MINIMUM_WATCHDOG_RUNWAY_SECONDS: 1800") <
      workflow.indexOf("Import exact once-built image and prove Cloudflare digest"),
  );
});
