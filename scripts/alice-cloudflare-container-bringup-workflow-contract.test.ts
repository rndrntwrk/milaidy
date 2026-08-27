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
    failsafeLoop.match(/deadline_epoch="\$\(\(now_epoch \+ (\d+)\)\)"/u)?.[1],
  );

  assert.equal(expirySeconds, 30 * 60);
});
