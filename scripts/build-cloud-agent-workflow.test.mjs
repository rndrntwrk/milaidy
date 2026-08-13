import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("cloud agent image publishes under the repository owner", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /IMAGE_NAME: \$\{\{ github\.repository_owner \}\}\/milaidy-agent/,
    "GHCR image ownership must follow the repository owner",
  );
  assert.doesNotMatch(
    workflow,
    /IMAGE_NAME:\s*milady-ai\//,
    "the RNDRNTWRK workflow must not publish to an unrelated GHCR namespace",
  );
});

test("staging smokes the exact published image and always tears it down", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /id: cloud-image[\s\S]*?uses: docker\/build-push-action@v7/,
    "the published image step must expose its immutable digest",
  );
  assert.match(
    workflow,
    /Smoke exact staging image[\s\S]*?build_environment == 'staging'[\s\S]*?steps\.cloud-image\.outputs\.digest/,
    "only staging may smoke the exact digest returned by the publisher",
  );
  assert.match(
    workflow,
    /org\.opencontainers\.image\.revision[\s\S]*?EXPECTED_REVISION/,
    "the smoke must bind the image revision label to the workflow SHA",
  );
  assert.match(
    workflow,
    /Cleanup staging smoke container[\s\S]*?always\(\)[\s\S]*?docker rm -f/,
    "the disposable staging container must be removed even after failure",
  );
});

test("cloud agent build keeps the checked-out Eliza workspace available", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const initStart = workflow.indexOf("- name: Init submodules");
  const installStart = workflow.indexOf("- name: Install dependencies");

  assert.ok(initStart >= 0, "Init submodules step must exist");
  assert.ok(
    installStart > initStart,
    "immutable dependency install must follow submodule initialization",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /disable-local-eliza-workspace\.mjs/,
    "the init step must not remove Eliza before workspace restoration",
  );
  assert.doesNotMatch(
    workflow.slice(initStart, installStart),
    /Restore build-critical workspaces|fs\.writeFileSync\("package\.json"/,
    "CI must not rewrite the committed workspace graph before frozen install",
  );
});

test("Alice root has no exact workspace paths removed by latest Eliza", () => {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const missing = rootPackage.workspaces.filter(
    (workspace) =>
      !workspace.startsWith("!") &&
      !workspace.includes("*") &&
      !fs.existsSync(path.join(repoRoot, workspace, "package.json")),
  );

  assert.deepEqual(missing, [], `missing exact workspaces: ${missing.join(", ")}`);
});

test("cloud agent build uses the Node major required by pinned Eliza", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaCore = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "eliza/packages/core/package.json"),
      "utf8",
    ),
  );
  const requiredMajor = elizaCore.engines?.node?.match(/>=\s*(\d+)/)?.[1];

  assert.ok(requiredMajor, "pinned Eliza must declare a minimum Node major");
  assert.match(
    workflow,
    new RegExp(`node-version: ["']${requiredMajor}["']`),
    `cloud agent build must use Node ${requiredMajor} required by pinned Eliza`,
  );

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(`^ARG NODE_VERSION=${requiredMajor}$`, "m"),
    `cloud runtime image must use Node ${requiredMajor} required by pinned Eliza`,
  );
});

test("cloud agent build uses the Bun version required by pinned Eliza", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const elizaPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "eliza/package.json"), "utf8"),
  );
  const requiredVersion = elizaPackage.packageManager?.match(/^bun@(.+)$/)?.[1];

  assert.ok(requiredVersion, "pinned Eliza must declare its Bun version");
  assert.equal(
    rootPackage.packageManager,
    `bun@${requiredVersion}`,
    "Alice and pinned Eliza must use one Bun version",
  );
  assert.match(
    workflow,
    new RegExp(`bun-version: ["']${requiredVersion.replaceAll(".", "\\.")}["']`),
    `cloud build must use Bun ${requiredVersion} required by pinned Eliza`,
  );

  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  assert.match(
    dockerfile,
    new RegExp(`^ARG BUN_VERSION=${requiredVersion.replaceAll(".", "\\.")}$`, "m"),
    `cloud runtime image must use Bun ${requiredVersion} required by pinned Eliza`,
  );
});

test("cloud agent frozen install accepts the current Eliza layout", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaApps = path.join(repoRoot, "eliza/apps");

  assert.equal(
    fs.existsSync(elizaApps),
    false,
    "the pinned official Eliza checkout should exercise its apps-free layout",
  );
  assert.match(
    workflow,
    /bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must install the committed lock without manifest mutation",
  );
  assert.match(
    workflow,
    /cd eliza\n\s+bun install --ignore-scripts --frozen-lockfile/,
    "cloud build must materialize the pinned Eliza workspace from its own lock",
  );
  assert.doesNotMatch(
    workflow,
    /bun run postinstall/,
    "cloud build must not apply legacy patches to the pinned official Eliza tree",
  );
  assert.doesNotMatch(
    workflow,
    /npm view .*dist\.tarball/,
    "cloud build must not replace locked dependencies with registry-latest tarballs",
  );
  assert.doesNotMatch(
    workflow,
    /eliza\/packages\/schemas|build had errors/,
    "cloud build must use current package scripts and fail closed on build errors",
  );
  assert.match(
    workflow,
    /cd eliza\/packages\/core\n\s+bun run build/,
    "cloud build must invoke the current Eliza core build script",
  );
  assert.match(
    workflow,
    /echo '!deploy\/cloud-agent-template' >> \.dockerignore/,
    "Docker context must retain the explicitly declared cloud-agent-template workspace",
  );
  assert.match(
    workflow,
    /echo '!apps\/homepage' >> \.dockerignore/,
    "Docker context must retain the apps wildcard workspace that exists in this checkout",
  );
  assert.match(
    workflow,
    /echo '!eliza\/packages\/examples' >> \.dockerignore/,
    "Docker context must retain pinned Eliza example workspaces for frozen resolution",
  );
});

test("cloud agent image does not copy removed Eliza apps", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.doesNotMatch(
    dockerfile,
    /\bcp(?: -a)? eliza\/apps\//,
    "image assembly must not require packages removed from official Eliza",
  );
  assert.doesNotMatch(
    dockerfile,
    /npm view .*dist\.tarball|https\.get\(/,
    "image assembly must never replace locked packages with registry-latest tarballs",
  );
  assert.equal(
    dockerfile.match(/const v = '\$\{VERSION_CLEAN\}';/g)?.length,
    1,
    "image version patch must remain valid JavaScript",
  );

  const elizaPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "eliza/package.json"), "utf8"),
  );
  const requiredBun = elizaPackage.packageManager?.match(/^bun@(.+)$/)?.[1];
  assert.ok(requiredBun, "pinned Eliza must declare a Bun version");
  assert.match(
    dockerfile,
    new RegExp(`FROM oven/bun:\\$\\{BUN_VERSION\\} AS bun-runtime`),
    "image build must source Bun from an exact versioned image",
  );
  assert.match(
    dockerfile,
    /RUN bun install --ignore-scripts --frozen-lockfile/,
    "image build must materialize runtime packages from the committed lock",
  );
  assert.doesNotMatch(
    dockerfile,
    /requiredLockedPackages[\s\S]*?['"]jsonrepair['"]/,
    "image checks must not retain the removed pre-beta.7 Anthropic dependency",
  );
});

test("cloud agent builds pinned Eliza UI assets before Alice web", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaUiBuild = workflow.indexOf("cd eliza/packages/ui\n          bun run build");
  const aliceWebBuild = workflow.indexOf("cd apps/app\n          bun run build:web");

  assert.ok(elizaUiBuild >= 0, "cloud build must materialize @elizaos/ui dist assets");
  assert.ok(
    aliceWebBuild > elizaUiBuild,
    "Alice web build must run after pinned Eliza UI assets exist",
  );
});

test("cloud agent builds pinned Eliza app-core assets before Alice web", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const elizaAppCoreBuild = workflow.indexOf(
    "cd eliza/packages/app-core\n          bun run build",
  );
  const aliceWebBuild = workflow.indexOf("cd apps/app\n          bun run build:web");

  assert.ok(
    elizaAppCoreBuild >= 0,
    "cloud build must materialize @elizaos/app-core dist assets",
  );
  assert.ok(
    aliceWebBuild > elizaAppCoreBuild,
    "Alice web build must run after pinned Eliza app-core assets exist",
  );
});

test("cloud agent builds official Eliza runtime plugins used by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const agentSkillsBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-agent-skills\n          bun run build",
  );
  const anthropicBuild = workflow.indexOf(
    "cd eliza/plugins/plugin-anthropic\n          bun run build",
  );
  const dockerBuild = workflow.indexOf("- name: Build and push Docker image");

  assert.ok(agentSkillsBuild >= 0, "official agent-skills plugin must be built");
  assert.ok(anthropicBuild >= 0, "official Anthropic plugin must be built");
  assert.ok(
    dockerBuild > agentSkillsBuild && dockerBuild > anthropicBuild,
    "official runtime plugins must be built before image assembly",
  );
});

test("cloud image retains the latest Eliza auth runtime closure", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const pruner = fs.readFileSync(
    path.join(repoRoot, "scripts/cloud-image-prune-deps.mjs"),
    "utf8",
  );

  const sharedBuild = workflow.indexOf(
    "cd eliza/packages/shared\n          bun run build",
  );
  const vaultBuild = workflow.indexOf(
    "cd eliza/packages/vault\n          bun run build",
  );
  const authBuild = workflow.indexOf(
    "cd eliza/packages/auth\n          bun run build",
  );
  const dockerBuild = workflow.indexOf("- name: Build and push Docker image");

  assert.ok(sharedBuild >= 0, "official shared package must be built");
  assert.ok(vaultBuild > sharedBuild, "vault must be built after shared");
  assert.ok(authBuild > vaultBuild, "auth must be built after its vault dependency");
  assert.ok(dockerBuild > authBuild, "auth must exist before image assembly");
  assert.match(pruner, /"eliza\/packages\/auth"/);
  assert.match(pruner, /"eliza\/packages\/vault"/);
  assert.match(pruner, /"@elizaos\/auth"/);
  assert.match(pruner, /"@elizaos\/vault"/);
});

test("cloud image retains the official Eliza plugins statically imported by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  for (const plugin of [
    "plugin-app-control",
    "plugin-app-manager",
    "plugin-scheduling",
    "plugin-wallet",
  ]) {
    const build = workflow.indexOf(
      `cd eliza/plugins/${plugin}\n          bun run build`,
    );
    assert.ok(build >= 0, `official ${plugin} must be built`);
    assert.ok(
      runtimeBuild > build,
      `${plugin} must exist before Alice's runtime bundle is assembled`,
    );
    assert.match(
      dockerfile,
      new RegExp(
        `cp eliza/plugins/${plugin}/package\\.json node_modules/@elizaos/${plugin}/[\\s\\S]*?cp -a eliza/plugins/${plugin}/dist node_modules/@elizaos/${plugin}/dist`,
      ),
      `the runtime image must copy the exact built ${plugin} package`,
    );
    assert.match(
      dockerfile,
      new RegExp(`requiredLockedPackages[\\s\\S]*?'@elizaos/${plugin}'`),
      `image assembly must fail closed if ${plugin} is absent`,
    );
  }
  assert.match(
    workflow,
    /Build @elizaos\/plugin-wallet[\s\S]*?bun run build \|\| \{[\s\S]*?test -f dist\/index\.mjs[\s\S]*?test -f dist\/diagnostic\.js[\s\S]*?bun run build:views/,
    "wallet's known declaration-only failure may be tolerated only after exact runtime outputs are verified",
  );
  assert.match(
    dockerfile,
    /node_modules\/@elizaos\/plugin-wallet\/dist\/index\.mjs node_modules\/@elizaos\/plugin-wallet\/dist\/diagnostic\.js/,
    "the image must verify wallet's actual runtime entrypoints",
  );
});

test("cloud image retains the official agent orchestrator statically imported by Alice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );
  const build = workflow.indexOf(
    "cd eliza/plugins/plugin-agent-orchestrator\n          bun run build",
  );
  const runtimeBuild = workflow.indexOf("- name: Build runtime (tsdown)");
  assert.ok(build >= 0, "official agent orchestrator must be built");
  assert.ok(
    runtimeBuild > build,
    "agent orchestrator must exist before Alice's runtime bundle is assembled",
  );
  assert.match(
    dockerfile,
    /cp eliza\/plugins\/plugin-agent-orchestrator\/package\.json node_modules\/@elizaos\/plugin-agent-orchestrator\/[\s\S]*?cp -a eliza\/plugins\/plugin-agent-orchestrator\/dist node_modules\/@elizaos\/plugin-agent-orchestrator\/dist/,
    "the runtime image must copy the exact built agent orchestrator",
  );
  assert.match(
    dockerfile,
    /requiredLockedPackages[\s\S]*?'@elizaos\/plugin-agent-orchestrator'/,
    "image assembly must fail closed if the orchestrator is absent",
  );
  assert.doesNotMatch(
    dockerfile,
    /Remove unbuilt orchestrator[\s\S]*?rm -rf[\s\S]*?node_modules\/@elizaos\/plugin-agent-orchestrator/,
    "the cloud image must not delete Alice's static orchestrator import",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-agent-orchestrator'\)/,
    "image assembly must evaluate the pinned orchestrator dependency graph",
  );
});

test("cloud image overlays the latest app-manager host services and imports the package", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "deploy/Dockerfile.ci"),
    "utf8",
  );

  assert.match(
    dockerfile,
    /cp eliza\/packages\/agent\/src\/services\/app-manager-agents-list-guard\.ts node_modules\/@elizaos\/agent\/src\/services\//,
    "latest official app-manager agents-list guard must be present in Alice's agent compatibility package",
  );
  assert.match(
    dockerfile,
    /cp eliza\/packages\/agent\/src\/services\/overlay-app-presence\.ts node_modules\/@elizaos\/agent\/src\/services\//,
    "latest official overlay presence service must be present in Alice's agent compatibility package",
  );
  assert.match(
    dockerfile,
    /import\('@elizaos\/plugin-app-manager'\)/,
    "the completed image dependency graph must import official plugin-app-manager during the build",
  );
});
