import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  ".github/workflows/alice-cloudflare-container-bringup.yml",
  "utf8",
);
const importJob = workflow.match(
  /\n  import_runtime:[\s\S]*?(?=\n  materialize:)/,
);
assert.ok(importJob, "import_runtime job must exist");

const jobTimeout = Number(
  importJob[0].match(/\n    timeout-minutes:\s*(\d+)/)?.[1],
);
assert.ok(
  Number.isInteger(jobTimeout) && jobTimeout >= 60,
  `import job must allow at least 60 minutes, got ${jobTimeout}`,
);

const pushTimeout = Number(
  importJob[0].match(
    /timeout\s+--signal=TERM\s+--kill-after=30s\s+(\d+)s[\s\\]+"\$WRANGLER"\s+containers push/,
  )?.[1],
);
assert.ok(
  Number.isInteger(pushTimeout) && pushTimeout >= 2400,
  `Cloudflare image push must allow at least 2400 seconds, got ${pushTimeout}`,
);
assert.ok(
  pushTimeout < jobTimeout * 60,
  `push timeout ${pushTimeout}s must fit inside import job timeout ${jobTimeout}m`,
);
console.log("alice pre-import push timeout contract: PASS");
