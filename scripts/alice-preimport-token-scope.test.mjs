import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/alice-cloudflare-container-bringup.yml", import.meta.url),
  "utf8",
);

test("pre-import checks Workers Scripts read scope before provider snapshot", () => {
  assert.match(
    workflow,
    /name: Verify Cloudflare deployment-token read scope before provider reads/,
  );
  assert.match(
    workflow,
    /ALICE_CLOUDFLARE_DEPLOY_TOKEN_SCOPE_INVALID/,
  );
  assert.match(
    workflow,
    /workers\/scripts\?per_page=1/,
  );
  assert.match(workflow, /cloudflare_code/);
  assert.match(
    workflow,
    /Capture exact active Durable Object identities read-only/,
  );
});
