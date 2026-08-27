import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(
  path.join(
    root,
    ".github",
    "workflows",
    "alice-cloudflare-container-bringup.yml",
  ),
  "utf8",
);

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("temporary Container exposes Alice on the runtime-consumed bind variables", () => {
  const containerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(containerSource, /MILADY_API_BIND: "0\.0\.0\.0"/u);
  assert.match(containerSource, /ELIZA_API_BIND: "0\.0\.0\.0"/u);
});

test("temporary Container records the Cloudflare startup diagnostic", () => {
  const containerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(
    containerSource,
    /override onError\(error: unknown\)[\s\S]*?console\.error\("ALICE_TEMP_CONTAINER_ERROR", error\)/u,
    "Container startup failures must retain the provider diagnostic",
  );
});

test("temporary Container gives the immutable Alice image its observed cold-start budget", () => {
  const containerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(
    containerSource,
    /override async fetch\(request: Request\): Promise<Response>[\s\S]*?startAndWaitForPorts\(\{[\s\S]*?ports: \[this\.defaultPort\][\s\S]*?instanceGetTimeoutMS: 60_000[\s\S]*?portReadyTimeoutMS: 120_000[\s\S]*?return this\.containerFetch\(request\)/u,
    "the Container must outlive the provider's default port-ready timeout before proxying",
  );
});

test("explicit cold-start wait preserves only the SDK provisioning transient", () => {
  const containerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(
    containerSource,
    /catch \(error\)[\s\S]*?there is no container instance that can be provided to this durable object[\s\S]*?status: 503[\s\S]*?throw error/u,
    "ordinary first-deploy provisioning must remain retryable without admitting unknown startup errors",
  );
});

test("boot probe allows the Container SDK readiness budget without exceeding staging expiry", () => {
  const healthLoop = between(
    workflow,
    'health_status=""',
    'echo "CONTAINER_BOOT_GREEN',
  );
  const maxTime = Number(healthLoop.match(/--max-time (\d+)/u)?.[1]);
  const bootWindow = Number(
    healthLoop.match(/BOOT_WINDOW_SECONDS=(\d+)/u)?.[1],
  );
  const delay = Number(healthLoop.match(/sleep (\d+)/u)?.[1]);

  assert.ok(Number.isInteger(maxTime), "missing curl max-time");
  assert.ok(Number.isInteger(bootWindow), "missing bounded boot window");
  assert.ok(Number.isInteger(delay), "missing retry delay");
  assert.ok(
    maxTime >= 125,
    "caller aborts before the explicit Alice cold-start budget",
  );
  assert.ok(
    bootWindow >= 10 * 60,
    "boot loop does not cover first-deploy provisioning",
  );
  assert.ok(
    bootWindow + maxTime + delay <= 25 * 60,
    "worst-case boot probes exceed the bounded staging window",
  );
  assert.match(
    healthLoop,
    /while \[ "\$\(date \+%s\)" -lt "\$BOOT_DEADLINE_EPOCH" \]; do/u,
  );
});

test("boot probe retries the bounded first-deploy 404 without accepting it as ready", () => {
  const healthLoop = between(
    workflow,
    'health_status=""',
    'echo "CONTAINER_BOOT_GREEN',
  );

  assert.match(
    healthLoop,
    /if \[ "\$health_status" = "200" \]; then\s+break/u,
    "only HTTP 200 may complete the boot probe",
  );
  assert.match(
    healthLoop,
    /"\$health_status" != "404"/u,
    "the first-deploy 404 must stay inside the bounded readiness loop",
  );
});

test("boot gate waits for the Alice runtime readiness contract before chat", () => {
  const healthLoop = between(
    workflow,
    'health_status=""',
    'echo "CONTAINER_BOOT_GREEN',
  );

  assert.match(
    healthLoop,
    /\$\{WORKER_URL\}\/health\/ready/u,
    "boot must probe runtime readiness, not process liveness",
  );
  assert.doesNotMatch(healthLoop, /\$\{WORKER_URL\}\/health\/live/u);
  assert.match(
    healthLoop,
    /"\$health_status" != "503"/u,
    "runtime-not-ready must remain inside the bounded readiness loop",
  );
});

test("independent teardown guard preserves the documented 30-minute expiry", () => {
  const failsafeLoop = between(
    workflow,
    'first_seen_epoch=""',
    'echo "FAILSAFE_CHECKPOINT',
  );
  const expirySeconds = Number(
    failsafeLoop.match(/expiry_seconds=(\d+)/u)?.[1],
  );

  assert.equal(expirySeconds, 30 * 60);
});

test("user-test mode is an explicit bounded 60-minute workflow input", () => {
  assert.match(
    workflow,
    /user_test_window_minutes:[\s\S]*?type: choice[\s\S]*?default: "0"[\s\S]*?options:[\s\S]*?- "0"[\s\S]*?- "60"/u,
  );
  assert.match(
    workflow,
    /USER_TEST_WINDOW_MINUTES: \$\{\{ inputs\.user_test_window_minutes \}\}/u,
  );
});

test("user-test page keeps its short-lived capability in the URL fragment", () => {
  const workerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(workerSource, /id="transcript"/u);
  assert.match(workerSource, /id="prompt"/u);
  assert.match(workerSource, /window\.location\.hash\.slice\(1\)/u);
  assert.match(workerSource, /history\.replaceState\(null, "", window\.location\.pathname\)/u);
  assert.match(workerSource, /"x-alice-user-test-token": capability/u);
  assert.match(workerSource, /content-security-policy/u);
  assert.match(workerSource, /script-src 'nonce-\$\{nonce\}'/u);
  assert.doesNotMatch(workerSource, /BRINGUP_USER_TEST_TOKEN[^\n]*Response/u);
});

test("user-test API requires the exact temporary secret while automated canary auth remains intact", () => {
  const workerSource = between(
    workflow,
    "cat > src/index.ts <<'EOF'",
    "\n          EOF",
  );

  assert.match(workerSource, /BRINGUP_USER_TEST_TOKEN\?: string/u);
  assert.match(
    workerSource,
    /pathname === "\/v1\/chat\/completions"[\s\S]*?x-alice-user-test-token[\s\S]*?env\.BRINGUP_USER_TEST_TOKEN/u,
  );
  assert.match(
    workerSource,
    /x-alice-bringup-token[\s\S]*?env\.BRINGUP_EDGE_TOKEN/u,
  );
});

test("successful user-test canary stays available for 60 minutes with an independent absolute ceiling", () => {
  const primarySuccess = between(
    workflow,
    'echo "CONTAINER_INSTANCE_GREEN',
    "trap - EXIT INT TERM",
  );
  const failsafeLoop = between(
    workflow,
    'first_seen_epoch=""',
    'echo "FAILSAFE_CHECKPOINT',
  );

  assert.match(
    primarySuccess,
    /if \[ "\$USER_TEST_WINDOW_MINUTES" = "60" \]; then[\s\S]*?USER_TEST_LINK_READY[\s\S]*?CLEANUP_COMPLETE=1/u,
  );
  assert.match(
    failsafeLoop,
    /expiry_seconds=1800[\s\S]*?if \[ "\$USER_TEST_WINDOW_MINUTES" = "60" \]; then[\s\S]*?expiry_seconds=5100/u,
  );
  assert.match(
    failsafeLoop,
    /primary_conclusion[\s\S]*?failure\|cancelled\|timed_out\|action_required/u,
    "failed primary jobs must clean up immediately instead of holding the test surface",
  );
  assert.match(failsafeLoop, /FAILSAFE_EXPIRY_REACHED/u);
  assert.match(failsafeLoop, /failsafe_cleanup_once/u);
});

test("the 60-minute owner window starts only after verified conversation readiness", () => {
  const bringupJob = between(workflow, "  bringup:", "\n  failsafe:");
  assert.match(
    bringupJob,
    /60 minutes after verified link readiness; absolute provider-resource ceiling: 85 minutes after creation/u,
  );
  assert.match(
    bringupJob,
    /CONVERSATION_GREEN[\s\S]*?LINK_READY_AT="\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)"[\s\S]*?EXPIRES_AT="\$\(date -u -d '\+60 minutes' \+%Y-%m-%dT%H:%M:%SZ\)"[\s\S]*?USER_TEST_LINK_READY/u,
  );
});

test("primary user-test owner remains alive and tears down on expiry or cancellation", () => {
  const bringupJob = between(workflow, "  bringup:", "\n  failsafe:");
  const userTestBranch = between(
    bringupJob,
    'echo "OBSERVABILITY_EMPTY" >&2',
    "          else",
  );

  assert.match(bringupJob, /timeout-minutes: 120/u);
  assert.match(userTestBranch, /USER_TEST_LINK_READY/u);
  assert.match(userTestBranch, /USER_TEST_WINDOW_EXPIRED/u);
  assert.match(
    userTestBranch,
    /USER_TEST_LINK_READY[\s\S]*?while true; do[\s\S]*?USER_TEST_WINDOW_EXPIRED[\s\S]*?cleanup[\s\S]*?CLEANUP_COMPLETE=1[\s\S]*?trap - EXIT INT TERM/u,
  );
  assert.doesNotMatch(
    userTestBranch,
    /USER_TEST_LINK_READY[\s\S]*?CLEANUP_COMPLETE=1[\s\S]*?trap - EXIT INT TERM[\s\S]*?USER_TEST_WINDOW_EXPIRED/u,
    "the primary cleanup trap must stay armed throughout the live window",
  );
});

test("independent expiry guard also tears down on cancellation", () => {
  const failsafeJob = workflow.slice(workflow.indexOf("  failsafe:"));

  assert.match(failsafeJob, /if: \$\{\{ always\(\) \}\}/u);
  assert.match(failsafeJob, /failsafe_on_exit\(\)/u);
  assert.match(failsafeJob, /trap failsafe_on_exit EXIT INT TERM/u);
  assert.match(failsafeJob, /failsafe_cleanup_once/u);
});

test("temporary user-test capability is a step-local secret and is never logged", () => {
  const bringupStep = between(
    workflow,
    "- name: Import exact image, run live conversation, and prove teardown",
    "  failsafe:",
  );

  assert.match(
    bringupStep,
    /ALICE_USER_TEST_LINK_TOKEN: \$\{\{ secrets\.ALICE_USER_TEST_LINK_TOKEN \}\}/u,
  );
  assert.match(bringupStep, /BRINGUP_USER_TEST_TOKEN/u);
  assert.doesNotMatch(
    bringupStep,
    /echo[^\n]*\$\{?ALICE_USER_TEST_LINK_TOKEN/u,
  );
  assert.doesNotMatch(
    bringupStep,
    /echo[^\n]*\$\{?BRINGUP_USER_TEST_TOKEN/u,
  );
  assert.doesNotMatch(bringupStep, /USER_TEST_LINK_READY[^\n]*#/u);
});

test("post-health conversation retries only the observed transient 503", () => {
  const conversationGate = between(
    workflow,
    'echo "CONTAINER_BOOT_GREEN',
    'chat_content_raw=',
  );

  assert.match(conversationGate, /for chat_attempt in \$\(seq 1 6\); do/u);
  assert.match(conversationGate, /if \[ "\$chat_status" = "200" \]; then[\s\S]*?break/u);
  assert.match(
    conversationGate,
    /if \[ "\$chat_status" != "503" \]; then[\s\S]*?CONVERSATION_HTTP_INVALID[\s\S]*?exit 1/u,
  );
  assert.match(conversationGate, /CONVERSATION_CONVERGENCE_RETRY/u);
  assert.match(
    conversationGate,
    /done[\s\S]*?if \[ "\$chat_status" != "200" \]; then[\s\S]*?CONVERSATION_HTTP_INVALID/u,
  );
  assert.doesNotMatch(conversationGate, /502\|503|503\|504|000\|503/u);
});

test("owner-link capability activates only after the automated conversation is green", () => {
  const deploymentBeforeConversation = between(
    workflow,
    'secret_payload="$(jq -cn',
    'echo "CONVERSATION_GREEN',
  );
  const afterConversation = workflow.slice(
    workflow.indexOf('echo "CONVERSATION_GREEN'),
  );

  assert.doesNotMatch(deploymentBeforeConversation, /BRINGUP_USER_TEST_TOKEN/u);
  assert.match(
    afterConversation,
    /printf '%s' "\$ALICE_USER_TEST_LINK_TOKEN" \| npx wrangler secret put \\\n\s*BRINGUP_USER_TEST_TOKEN --name "\$WORKER_NAME"/u,
  );
  assert.match(afterConversation, /USER_TEST_LINK_BINDING_GREEN/u);
  const finalVersionGate = between(
    afterConversation,
    'echo "USER_TEST_LINK_BINDING_GREEN"',
    'echo "USER_TEST_LINK_READY',
  );
  assert.match(finalVersionGate, /USER_TEST_FINAL_PAGE_GREEN/u);
  assert.match(finalVersionGate, /USER_TEST_FINAL_HEALTH_GREEN/u);
  assert.match(finalVersionGate, /x-alice-user-test-token: \$\{ALICE_USER_TEST_LINK_TOKEN\}/u);
  assert.match(finalVersionGate, /USER_TEST_FINAL_CHAT_GREEN/u);
  assert.match(
    finalVersionGate,
    /USER_TEST_FINAL_INSTANCE_GREEN[^\n]*state=running[^\n]*count=1/u,
  );
  assert.match(
    afterConversation,
    /USER_TEST_LINK_BINDING_GREEN[\s\S]*?USER_TEST_FINAL_PAGE_GREEN[\s\S]*?USER_TEST_FINAL_HEALTH_GREEN[\s\S]*?USER_TEST_FINAL_CHAT_GREEN[\s\S]*?USER_TEST_FINAL_INSTANCE_GREEN[\s\S]*?USER_TEST_LINK_READY/u,
  );
});
