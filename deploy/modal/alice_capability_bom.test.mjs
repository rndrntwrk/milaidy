import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalAliceCapabilityBom,
  discoverAliceCapabilityInputs,
  digestAliceCapabilityBom,
  generateAliceCapabilityBom,
} from "./alice_capability_bom.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "alice-capability-bom-"));
}

function writePackage(root, name, options = {}) {
  const packageRoot = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({
      name,
      version: options.version ?? "1.2.3",
      type: "module",
      exports: { ".": options.entrypoint ?? "./index.mjs" },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, options.file ?? "index.mjs"),
    options.source ??
      `export default { name: "${options.runtimeName ?? name}", actions: [{ name: "REAL_ACTION" }] };\n`,
  );
  return packageRoot;
}

function packageEntry(name, classification = "core", options = {}) {
  return {
    id: `package:${name}`,
    classification,
    source: { type: "package", package: name, entrypoint: "." },
    runtimeNames: options.runtimeNames ?? [options.runtimeName ?? name],
    adapter: null,
    policyState:
      classification === "policy-disabled" ? "disabled" : "enabled",
  };
}

function policy(entries) {
  return { schemaVersion: "alice.capability-policy.v1", entries };
}

function hoistBunStorePackages(root) {
  const bunRoot = path.join(root, "node_modules/.bun");
  for (const entry of fs.readdirSync(bunRoot).sort()) {
    const nodeModules = path.join(bunRoot, entry, "node_modules");
    for (const packageOrScope of fs.readdirSync(nodeModules).sort()) {
      if (packageOrScope.startsWith("@")) {
        const scopeRoot = path.join(nodeModules, packageOrScope);
        for (const packageName of fs.readdirSync(scopeRoot).sort()) {
          const source = path.join(scopeRoot, packageName);
          const target = path.join(root, "node_modules", packageOrScope, packageName);
          if (!fs.existsSync(target)) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.cpSync(source, target, { recursive: true });
          }
        }
        continue;
      }
      const source = path.join(nodeModules, packageOrScope);
      const target = path.join(root, "node_modules", packageOrScope);
      if (!fs.existsSync(target)) fs.cpSync(source, target, { recursive: true });
    }
  }
}

function materializeCapabilityPackagesFromDockerfile(root) {
  const dockerfile = fs.readFileSync(
    path.join(REPO_ROOT, "deploy/Dockerfile.ci"),
    "utf8",
  );
  const packageNames = [];
  for (const match of dockerfile.matchAll(
    /\bcp\s+[^\s\\]+\/package\.json\s+node_modules\/((?:@[^/\s\\]+\/)?[^/\s;\\]+)\/;/g,
  )) {
    const packageName = match[1];
    if (!/^@(?:elizaos|miladyai|rndrntwrk)\/(?:plugin-|app-)/.test(packageName)) {
      continue;
    }
    writePackage(root, packageName);
    packageNames.push(packageName);
  }
  return [...new Set(packageNames)].sort();
}

function applyCapabilityPruneFromDockerfile(root) {
  const dockerfile = fs.readFileSync(path.join(REPO_ROOT, "deploy/Dockerfile.ci"), "utf8");
  const pruneBlock = dockerfile.match(
    /# Remove implementations that the checked capability policy[\s\S]*?(?=\n# Fix @ai-sdk\/provider-utils version conflict:)/,
  )?.[0];
  assert.ok(pruneBlock, "production capability-prune block must exist");
  for (const match of pruneBlock.matchAll(/node_modules\/((?:@[^/\s\\]+\/)?[^\s\\]+)/g)) {
    fs.rmSync(path.join(root, "node_modules", ...match[1].split("/")), {
      recursive: true,
      force: true,
    });
  }
}

test("the production Docker materialization and broad hoist leave no unclassified capability package", () => {
  const root = fixtureRoot();
  const retainedPackages = new Map([
    ["@elizaos/app-contacts", "module"],
    ["@elizaos/app-phone", "module"],
    ["@elizaos/app-wallet", "module"],
    ["@elizaos/app-wifi", "module"],
    ["@elizaos/plugin-browser-bridge", "plugin"],
    ["@elizaos/plugin-cli", "plugin"],
    ["@elizaos/plugin-discord-local", "plugin"],
    ["@elizaos/plugin-groq", "plugin"],
    ["@elizaos/plugin-knowledge", "plugin"],
    ["@elizaos/plugin-solana", "plugin"],
    ["@elizaos/plugin-video", "plugin"],
    ["@elizaos/plugin-wallet", "plugin"],
    ["@elizaos/plugin-wechat", "plugin"],
    ["@huggingface/jinja", "module"],
    ["@miladyai/plugin-wechat", "plugin"],
  ]);
  const installedPackages = [...retainedPackages.keys(), "onnxruntime-common"];
  try {
    for (const [index, packageName] of installedPackages.entries()) {
      const packageRoot = path.join(
        root,
        "node_modules/.bun",
        `alice-production-${index}@1.0.0`,
        "node_modules",
        ...packageName.split("/"),
      );
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        `${JSON.stringify({
          name: packageName,
          version: "1.0.0",
          type: "module",
          exports: { ".": "./index.mjs" },
        })}\n`,
      );
      fs.writeFileSync(path.join(packageRoot, "index.mjs"), "export default {};\n");
    }

    hoistBunStorePackages(root);
    const explicitlyMaterializedPackages =
      materializeCapabilityPackagesFromDockerfile(root);
    applyCapabilityPruneFromDockerfile(root);

    const checkedPolicy = JSON.parse(
      fs.readFileSync(
        path.join(REPO_ROOT, "deploy/alice/alice-capability-policy.v1.json"),
        "utf8",
      ),
    );
    const classifiedIds = new Set(checkedPolicy.entries.map((entry) => entry.id));
    const discovery = discoverAliceCapabilityInputs(root, checkedPolicy);
    const expectedPackages = [
      ...new Set([
        ...retainedPackages.keys(),
        ...explicitlyMaterializedPackages,
      ]),
    ].sort();
    assert.deepEqual(discovery.packageNames, expectedPackages);
    assert.equal(discovery.packageNames.includes("onnxruntime-common"), false);

    const missing = discovery.packageNames
      .map((packageName) => `package:${packageName}`)
      .filter((id) => !classifiedIds.has(id));
    assert.deepEqual(missing, []);

    for (const [packageName, surface] of retainedPackages) {
      const policyEntry = checkedPolicy.entries.find(
        (entry) => entry.id === `package:${packageName}`,
      );
      assert.deepEqual(policyEntry, {
        id: `package:${packageName}`,
        classification: "policy-disabled",
        source: { type: "package", package: packageName, entrypoint: "." },
        surface,
        runtimeNames: [],
        adapter: null,
        policyState: "disabled",
      });
    }

    for (const packageName of [
      "@elizaos/plugin-app-control",
      "@elizaos/plugin-app-manager",
      "@elizaos/plugin-scheduling",
    ]) {
      assert.ok(
        explicitlyMaterializedPackages.includes(packageName),
        `${packageName} must be bound to the production Docker materialization block`,
      );
      const policyEntry = checkedPolicy.entries.find(
        (entry) => entry.id === `package:${packageName}`,
      );
      assert.deepEqual(policyEntry, {
        id: `package:${packageName}`,
        classification: "policy-disabled",
        source: { type: "package", package: packageName, entrypoint: "." },
        surface: "plugin",
        runtimeNames: [],
        adapter: null,
        policyState: "disabled",
      });
    }

    const remoteModelExecution = checkedPolicy.entries.find(
      (entry) => entry.id === "adapter:remote-model-execution",
    );
    assert.ok(
      remoteModelExecution?.prohibitedPackages?.includes("onnxruntime-common"),
      "the orphaned ONNX package must remain prohibited after final-image pruning",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("canonical BOM is deterministic across shuffled discovery", async () => {
  const root = fixtureRoot();
  try {
    writePackage(root, "@fixture/plugin-alpha", { runtimeName: "alpha" });
    writePackage(root, "@fixture/plugin-beta", { runtimeName: "beta" });
    const checkedPolicy = policy([
      packageEntry("@fixture/plugin-alpha", "core", { runtimeName: "alpha" }),
      packageEntry("@fixture/plugin-beta", "policy-disabled", {
        runtimeName: "beta",
      }),
    ]);
    const first = await generateAliceCapabilityBom({
      root,
      policy: checkedPolicy,
      discovery: {
        packageNames: ["@fixture/plugin-beta", "@fixture/plugin-alpha"],
        internalCapabilityIds: [],
      },
    });
    const second = await generateAliceCapabilityBom({
      root,
      policy: { ...checkedPolicy, entries: [...checkedPolicy.entries].reverse() },
      discovery: {
        packageNames: ["@fixture/plugin-alpha", "@fixture/plugin-beta"],
        internalCapabilityIds: [],
      },
    });
    const firstBytes = canonicalAliceCapabilityBom(first);
    const secondBytes = canonicalAliceCapabilityBom(second);
    assert.equal(firstBytes, secondBytes);
    assert.ok(firstBytes.endsWith("\n"));
    assert.ok(!firstBytes.endsWith("\n\n"));
    assert.equal(digestAliceCapabilityBom(firstBytes), digestAliceCapabilityBom(secondBytes));
    assert.deepEqual(
      first.entries.map((entry) => entry.id),
      ["package:@fixture/plugin-alpha", "package:@fixture/plugin-beta"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("package hashing excludes nested dependency links from Bun's installed layout", async () => {
  const root = fixtureRoot();
  try {
    const packageRoot = writePackage(root, "@fixture/plugin-alpha", {
      runtimeName: "alpha",
    });
    const dependencyRoot = writePackage(root, "@fixture/runtime-dependency", {
      runtimeName: "dependency",
    });
    fs.mkdirSync(path.join(packageRoot, "node_modules", "@fixture"), {
      recursive: true,
    });
    fs.symlinkSync(
      dependencyRoot,
      path.join(packageRoot, "node_modules", "@fixture", "runtime-dependency"),
      "dir",
    );
    const bom = await generateAliceCapabilityBom({
      root,
      policy: policy([
        packageEntry("@fixture/plugin-alpha", "core", {
          runtimeName: "alpha",
        }),
      ]),
      discovery: {
        packageNames: ["@fixture/plugin-alpha"],
        internalCapabilityIds: [],
      },
    });
    assert.equal(
      bom.entries[0].files.some((file) => file.path.startsWith("node_modules/")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing classification and stale checked policy both fail closed", async () => {
  const root = fixtureRoot();
  try {
    writePackage(root, "@fixture/plugin-alpha", { runtimeName: "alpha" });
    writePackage(root, "@fixture/plugin-unclassified", {
      runtimeName: "unclassified",
    });
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([packageEntry("@fixture/plugin-alpha", "core", { runtimeName: "alpha" })]),
        discovery: {
          packageNames: ["@fixture/plugin-alpha", "@fixture/plugin-unclassified"],
          internalCapabilityIds: [],
        },
      }),
      /ALICE_CAPABILITY_CLASSIFICATION_MISSING/,
    );
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-alpha", "core", { runtimeName: "alpha" }),
          packageEntry("@fixture/plugin-stale", "core", { runtimeName: "stale" }),
        ]),
        discovery: {
          packageNames: ["@fixture/plugin-alpha"],
          internalCapabilityIds: [],
        },
      }),
      /ALICE_CAPABILITY_POLICY_STALE/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("all production stub version forms and stub runtime names are rejected", async () => {
  for (const version of [
    "0.0.0-cloud-stub",
    "0.0.0-stub",
    "0.0.0-milady-stub",
  ]) {
    const root = fixtureRoot();
    try {
      writePackage(root, "@fixture/plugin-core", {
        version,
        runtimeName: "core-real",
      });
      await assert.rejects(
        generateAliceCapabilityBom({
          root,
          policy: policy([
            packageEntry("@fixture/plugin-core", "core", {
              runtimeName: "core-real",
            }),
          ]),
          discovery: {
            packageNames: ["@fixture/plugin-core"],
            internalCapabilityIds: [],
          },
        }),
        /ALICE_CAPABILITY_STUB_REJECTED/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const root = fixtureRoot();
  try {
    writePackage(root, "@fixture/plugin-core", { runtimeName: "core-stub" });
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-core", "core", { runtimeName: "core-stub" }),
        ]),
        discovery: {
          packageNames: ["@fixture/plugin-core"],
          internalCapabilityIds: [],
        },
      }),
      /ALICE_CAPABILITY_STUB_REJECTED/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("entrypoint escape, missing bytes, and empty core surface fail qualification", async () => {
  const root = fixtureRoot();
  try {
    const escaped = path.join(root, "escaped.mjs");
    fs.writeFileSync(escaped, 'export default { name: "escaped", actions: [{}] };\n');
    const packageRoot = writePackage(root, "@fixture/plugin-core", {
      runtimeName: "core-real",
    });
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@fixture/plugin-core",
        version: "1.2.3",
        type: "module",
        exports: { ".": "../../../escaped.mjs" },
      })}\n`,
    );
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-core", "core", { runtimeName: "core-real" }),
        ]),
        discovery: { packageNames: ["@fixture/plugin-core"], internalCapabilityIds: [] },
      }),
      /ALICE_CAPABILITY_ENTRYPOINT_ESCAPE/,
    );

    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@fixture/plugin-core",
        version: "1.2.3",
        type: "module",
        exports: { ".": "./missing.mjs" },
      })}\n`,
    );
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-core", "core", { runtimeName: "core-real" }),
        ]),
        discovery: { packageNames: ["@fixture/plugin-core"], internalCapabilityIds: [] },
      }),
      /ALICE_CAPABILITY_ENTRYPOINT_MISSING/,
    );

    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@fixture/plugin-core",
        version: "1.2.3",
        type: "module",
        exports: { ".": "./index.mjs" },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(packageRoot, "index.mjs"),
      'export default { name: "core-real", actions: [], providers: [], services: [], routes: [] };\n',
    );
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-core", "core", { runtimeName: "core-real" }),
        ]),
        discovery: { packageNames: ["@fixture/plugin-core"], internalCapabilityIds: [] },
      }),
      /ALICE_CAPABILITY_CORE_SURFACE_EMPTY/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("delegated and platform-incompatible implementations must be absent", async () => {
  const root = fixtureRoot();
  try {
    const adapterPath = "adapters/workflows.mjs";
    fs.mkdirSync(path.join(root, "adapters"), { recursive: true });
    fs.writeFileSync(
      path.join(root, adapterPath),
      'export const adapter = { id: "cloudflare-workflows", authenticated: true, schemaVersion: "alice.delegated-adapter.v1" };\n',
    );
    writePackage(root, "@fixture/plugin-cron", { runtimeName: "cron" });
    writePackage(root, "@fixture/native-tracker", { runtimeName: "native" });
    const entries = [
      {
        id: "adapter:cloudflare-workflows",
        classification: "delegated",
        source: { type: "adapter", path: adapterPath, export: "adapter" },
        runtimeNames: [],
        adapter: "cloudflare-workflows",
        policyState: "delegated",
        prohibitedPackages: ["@fixture/plugin-cron"],
      },
      {
        id: "platform:activity-tracker",
        classification: "platform-incompatible",
        source: { type: "platform", platform: "darwin" },
        runtimeNames: [],
        adapter: null,
        policyState: "unavailable",
        prohibitedPackages: ["@fixture/native-tracker"],
      },
    ];
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy(entries),
        discovery: {
          packageNames: [],
          internalCapabilityIds: entries.map((entry) => entry.id),
        },
      }),
      /ALICE_CAPABILITY_PRIVILEGED_IMPLEMENTATION_PRESENT/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("policy-disabled is a real installed implementation, never a missing package", async () => {
  const root = fixtureRoot();
  try {
    await assert.rejects(
      generateAliceCapabilityBom({
        root,
        policy: policy([
          packageEntry("@fixture/plugin-disabled", "policy-disabled", {
            runtimeName: "disabled-real",
          }),
        ]),
        discovery: {
          packageNames: ["@fixture/plugin-disabled"],
          internalCapabilityIds: [],
        },
      }),
      /ALICE_CAPABILITY_PACKAGE_MISSING/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("policy-disabled bytes stay inert while core package surface is evaluated", async () => {
  const root = fixtureRoot();
  try {
    writePackage(root, "@fixture/plugin-disabled", {
      source: 'throw new Error("POLICY_DISABLED_ENTRYPOINT_EVALUATED");\n',
    });
    writePackage(root, "@fixture/plugin-core", {
      runtimeName: "core-real",
      source:
        'globalThis.__aliceCoreCapabilityEvaluations = (globalThis.__aliceCoreCapabilityEvaluations ?? 0) + 1; export default { name: "core-real", actions: [{ name: "REAL_ACTION" }] };\n',
    });
    globalThis.__aliceCoreCapabilityEvaluations = 0;

    const bom = await generateAliceCapabilityBom({
      root,
      policy: policy([
        packageEntry("@fixture/plugin-disabled", "policy-disabled", {
          runtimeNames: [],
        }),
        packageEntry("@fixture/plugin-core", "core", {
          runtimeName: "core-real",
        }),
      ]),
      discovery: {
        packageNames: [
          "@fixture/plugin-disabled",
          "@fixture/plugin-core",
        ],
        internalCapabilityIds: [],
      },
    });

    assert.equal(globalThis.__aliceCoreCapabilityEvaluations, 1);
    assert.deepEqual(
      bom.entries.map(({ id, implementationCallable, runtimeNames }) => ({
        id,
        implementationCallable,
        runtimeNames,
      })),
      [
        {
          id: "package:@fixture/plugin-core",
          implementationCallable: true,
          runtimeNames: ["core-real"],
        },
        {
          id: "package:@fixture/plugin-disabled",
          implementationCallable: false,
          runtimeNames: [],
        },
      ],
    );
  } finally {
    delete globalThis.__aliceCoreCapabilityEvaluations;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("BOM hashes sorted final-image package file records", async () => {
  const root = fixtureRoot();
  try {
    const packageRoot = writePackage(root, "@fixture/plugin-core", {
      runtimeName: "core-real",
    });
    fs.writeFileSync(path.join(packageRoot, "payload.bin"), Buffer.from([3, 1, 4]));
    const bom = await generateAliceCapabilityBom({
      root,
      policy: policy([
        packageEntry("@fixture/plugin-core", "core", { runtimeName: "core-real" }),
      ]),
      discovery: { packageNames: ["@fixture/plugin-core"], internalCapabilityIds: [] },
    });
    const entry = bom.entries[0];
    assert.deepEqual(
      entry.files.map((record) => record.path),
      ["index.mjs", "package.json", "payload.bin"],
    );
    assert.equal(
      entry.files[2].sha256,
      `sha256:${crypto.createHash("sha256").update(Buffer.from([3, 1, 4])).digest("hex")}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
