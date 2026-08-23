import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(repoRoot, "scripts/alice-frozen-install-retry.sh");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-frozen-install-"));
  const fakeBun = path.join(root, "fake-bun.sh");
  const countPath = path.join(root, "count");
  const argsPath = path.join(root, "args");
  fs.writeFileSync(
    fakeBun,
    `#!/usr/bin/env bash
set -euo pipefail
count=0
if [ -s "$ALICE_FAKE_COUNT" ]; then count="$(cat "$ALICE_FAKE_COUNT")"; fi
count="$((count + 1))"
printf '%s' "$count" > "$ALICE_FAKE_COUNT"
printf '%s\\n' "$*" >> "$ALICE_FAKE_ARGS"
case "$ALICE_FAKE_MODE" in
  transient-once)
    if [ "$count" -eq 1 ]; then
      printf '%s\\n' 'error: GET https://api.github.com/repos/example/plugin/tarball/ - 504' >&2
      exit 1
    fi
    ;;
  deterministic)
    printf '%s\\n' 'error: lockfile had changes, but lockfile is frozen' >&2
    exit 17
    ;;
  transient-always)
    printf '%s\\n' 'error: GET https://api.github.com/repos/example/plugin/tarball/ - 503' >&2
    exit 29
    ;;
esac
`,
    { mode: 0o755 },
  );
  return { root, fakeBun, countPath, argsPath };
}

function run(mode) {
  const item = fixture();
  const result = spawnSync("bash", [installer], {
    cwd: item.root,
    encoding: "utf8",
    env: {
      ...process.env,
      ALICE_BUN_BIN: item.fakeBun,
      ALICE_FAKE_ARGS: item.argsPath,
      ALICE_FAKE_COUNT: item.countPath,
      ALICE_FAKE_MODE: mode,
      ALICE_FROZEN_INSTALL_RETRY_DELAY_SECONDS: "0",
      RUNNER_TEMP: item.root,
    },
  });
  const count = fs.existsSync(item.countPath)
    ? Number(fs.readFileSync(item.countPath, "utf8"))
    : 0;
  const args = fs.existsSync(item.argsPath)
    ? fs.readFileSync(item.argsPath, "utf8").trim().split("\n")
    : [];
  fs.rmSync(item.root, { recursive: true, force: true });
  return { ...result, count, args };
}

test("retries a transient registry fetch and preserves the frozen install arguments", () => {
  const result = run("transient-once");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.count, 2);
  assert.deepEqual(result.args, [
    "install --ignore-scripts --frozen-lockfile",
    "install --ignore-scripts --frozen-lockfile",
  ]);
});

test("fails deterministic frozen-lockfile errors without retrying", () => {
  const result = run("deterministic");
  assert.equal(result.status, 17);
  assert.equal(result.count, 1);
});

test("bounds repeated transient failures to three attempts", () => {
  const result = run("transient-always");
  assert.equal(result.status, 29);
  assert.equal(result.count, 3);
});

test("all critical Alice release installs use the bounded retry helper", () => {
  const deploy = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/deploy-alice-cloudflare.yml"),
    "utf8",
  );
  const watchdog = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/recover-alice-production-watchdog.yml"),
    "utf8",
  );
  for (const source of [deploy, watchdog]) {
    for (const block of source.matchAll(
      /- name: Install exact (?:release|recovery) dependencies\n([\s\S]*?)(?=\n\s+- name:)/g,
    )) {
      assert.match(block[1], /bash scripts\/alice-frozen-install-retry\.sh/);
      assert.doesNotMatch(
        block[1],
        /run: bun install --ignore-scripts --frozen-lockfile/,
      );
    }
  }
});
