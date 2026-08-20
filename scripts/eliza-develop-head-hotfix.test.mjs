import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const patchRelativePath =
  "scripts/alice-eliza-runtime-patches/eliza-f43d944-client-cloud-import-dedupe.patch";
const patchPath = path.join(repoRoot, patchRelativePath);
const workflowPath = path.join(
  repoRoot,
  ".github/workflows/build-cloud-agent.yml",
);
const targetRelativePath = "packages/ui/src/api/client-cloud.ts";

const brokenImportBlock = `import {
  normalizeDirectCloudSharedAgentApiBase,
} from "../utils/cloud-agent-base";
import { ElizaClient } from "./client-base";
import { desktopHttpTransportForUrl } from "./desktop-http-transport";
import { fetchAgentTransport, type AgentRequestTransport } from "./transport";
import type {
  ApiError,
  CloudApiKeySummary,
} from "./client-types";
import { desktopHttpTransportForUrl } from "./desktop-http-transport";
import {
  DEFAULT_DIRECT_CLOUD_APP_BASE_URL,
} from "./direct-cloud-endpoints";
import { fetchAgentTransport } from "./transport";
`;

const expectedImportBlock = `import {
  normalizeDirectCloudSharedAgentApiBase,
} from "../utils/cloud-agent-base";
import { ElizaClient } from "./client-base";
import type {
  ApiError,
  CloudApiKeySummary,
} from "./client-types";
import { desktopHttpTransportForUrl } from "./desktop-http-transport";
import {
  DEFAULT_DIRECT_CLOUD_APP_BASE_URL,
} from "./direct-cloud-endpoints";
import { fetchAgentTransport } from "./transport";
`;

test("the f43d944 hotfix removes only the duplicate cloud transport imports", () => {
  const fixtureRoot = mkdtempSync(
    path.join(os.tmpdir(), "alice-eliza-head-hotfix-"),
  );
  try {
    const targetPath = path.join(fixtureRoot, targetRelativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, brokenImportBlock);

    const applied = spawnSync("git", ["apply", "--unsafe-paths", patchPath], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
    assert.equal(
      applied.status,
      0,
      `hotfix must apply to the f43d944 import shape: ${applied.stderr}`,
    );
    assert.equal(readFileSync(targetPath, "utf8"), expectedImportBlock);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("the cloud build verifies and applies the exact hotfix before install", () => {
  const patchBytes = readFileSync(patchPath);
  const patchSha256 = createHash("sha256").update(patchBytes).digest("hex");
  const workflow = readFileSync(workflowPath, "utf8");
  const hotfixStep = workflow.match(
    /- name: Apply qualified Eliza develop hotfix[\s\S]*?- name: Port Alice operator bridge/,
  )?.[0];

  assert.ok(hotfixStep, "the qualified hotfix step must precede Alice porting");
  assert.match(hotfixStep, new RegExp(patchSha256));
  assert.match(
    hotfixStep,
    /sha256sum -c -/,
    "the build must fail closed if the tracked patch bytes drift",
  );
  assert.match(
    hotfixStep,
    /test "\$\(git -C eliza rev-parse HEAD\)" = "f43d944af31d7066438f3bae249f016cc885203d"/,
    "the patch must never float onto a different upstream revision",
  );
  assert.match(
    hotfixStep,
    new RegExp(
      `git -C eliza apply \\.\\./${patchRelativePath.replaceAll("/", "\\/")}`,
    ),
  );
  assert.ok(
    workflow.indexOf("- name: Install dependencies") >
      workflow.indexOf("- name: Apply qualified Eliza develop hotfix"),
    "dependencies must compile only after the verified source fix",
  );
});
