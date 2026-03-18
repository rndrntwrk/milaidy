#!/usr/bin/env node
/**
 * Post-install patches for various @elizaos and dependency packages.
 *
 * 1) @elizaos/plugin-sql: Adds .onConflictDoNothing() to createWorld(), guards
 *    ensureEmbeddingDimension(), removes pgcrypto from extension list.
 *    Remove once plugin-sql publishes fixes.
 *
 * 2) Bun exports: Some published @elizaos packages set exports["."].bun =
 *    "./src/index.ts", which only exists in their dev workspace, not in the
 *    npm tarball. Bun picks "bun" first and fails. We remove the dead "bun"/
 *    "default" conditions so Bun resolves via "import" → dist/. WHY: See
 *    docs/plugin-resolution-and-node-path.md "Bun and published package exports".
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchAgentSkillsCatalogFetch,
  patchAppCoreMiladyAssets,
  patchAutonomousMiladyOnboardingPresets,
  patchAutonomousTypeError,
  patchBrokenElizaCoreRuntimeDists,
  patchBunExports,
  patchExtensionlessJsExports,
  patchMissingLifecycleScript,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
} from "./lib/patch-bun-exports.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Patch @elizaos packages whose exports["."].bun points to ./src/index.ts.
// Logic lives in scripts/lib/patch-bun-exports.mjs (testable).
// ---------------------------------------------------------------------------
patchBunExports(root, "@elizaos/plugin-coding-agent");
patchMissingLifecycleScript(
  root,
  "@elizaos/plugin-agent-orchestrator",
  "postinstall",
  "./scripts/ensure-node-pty.mjs",
);
patchAgentSkillsCatalogFetch(root);

// @noble/curves and @noble/hashes publish ".js" subpath exports, while ethers
// imports extensionless paths like "@noble/curves/secp256k1" and
// "@noble/hashes/sha3". Add extensionless aliases so Bun resolves them.
patchExtensionlessJsExports(root, "@noble/curves");

// @noble/hashes only exports subpaths with explicit ".js" suffixes (for
// example "./sha3.js"), but ethers imports "@noble/hashes/sha3". Add
// extensionless aliases so Bun resolves the published package at runtime.
patchExtensionlessJsExports(root, "@noble/hashes");
patchNobleHashesCompat(root);
patchProperLockfileSignalExitCompat(root);
patchBrokenElizaCoreRuntimeDists(root);
patchAutonomousMiladyOnboardingPresets(root);
patchAppCoreMiladyAssets(root);
patchAutonomousTypeError(root);

/**
 * Vite caches prebundled dependencies under node_modules/.vite. When patch-deps
 * rewrites installed @elizaos packages, that cache can keep serving the old
 * upstream app-core bundle until it is cleared or Vite is forced to rebuild.
 * Always drop the optimize cache here so the frontend picks up patched deps.
 */
for (const viteCacheDir of [
  resolve(root, "node_modules", ".vite"),
  resolve(root, "apps/app", "node_modules", ".vite"),
]) {
  if (!existsSync(viteCacheDir)) continue;
  rmSync(viteCacheDir, { recursive: true, force: true });
  console.log(`[patch-deps] Cleared Vite optimize cache: ${viteCacheDir}`);
}

/**
 * Patch @elizaos/core synthetic action/reply chat messages.
 *
 * The published core runtime currently persists internal action bookkeeping as
 * normal conversation memories, which shows up in Milady chat as:
 *   - "Generated reply: ..."
 *   - "Executed action: ..."
 *
 * Milady already surfaces the real assistant reply and the avatar side effects,
 * so these extra messages duplicate the turn and clutter chat history. We keep
 * the action results in runtime state/logs, but stop emitting them as
 * user-facing chat memories.
 */
function addUniquePath(targets, seenRealpaths, path) {
  if (!existsSync(path)) return;
  try {
    const rp = realpathSync(path);
    if (seenRealpaths.has(rp)) return;
    seenRealpaths.add(rp);
    targets.push(path);
  } catch {
    if (!targets.includes(path)) targets.push(path);
  }
}

function findAllElizaCoreBundleFiles() {
  const targets = [];
  const seenRealpaths = new Set();
  const relPaths = [
    "dist/index.node.js",
    "dist/index.browser.js",
    "dist/index.js",
    "dist/testing/index.js",
    "dist/browser/index.browser.js",
    "dist/node/index.node.js",
  ];
  const searchRoots = [root, resolve(root, "apps/app")];

  for (const searchRoot of searchRoots) {
    for (const relPath of relPaths) {
      addUniquePath(
        targets,
        seenRealpaths,
        resolve(searchRoot, `node_modules/@elizaos/core/${relPath}`),
      );
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (!existsSync(bunCacheDir)) continue;

    try {
      const entries = readdirSync(bunCacheDir);
      for (const entry of entries) {
        if (!entry.startsWith("@elizaos+core@")) continue;
        for (const relPath of relPaths) {
          addUniquePath(
            targets,
            seenRealpaths,
            resolve(
              bunCacheDir,
              entry,
              `node_modules/@elizaos/core/${relPath}`,
            ),
          );
        }
      }
    } catch {
      // Ignore bun cache traversal errors.
    }
  }

  return targets;
}

const elizaCoreBundleTargets = findAllElizaCoreBundleFiles();
const coreGeneratedReplyPattern =
  /text:\s*`Generated reply: \${[$A-Za-z_][\w$]*\.text}`,/g;
const coreActionMemoryPattern =
  /const ([$A-Za-z_][\w$]*) = \{\s*id: ([$A-Za-z_][\w$]*),\s*entityId: this\.agentId,\s*roomId: ([$A-Za-z_][\w$]*)\.roomId,\s*worldId: \3\.worldId,\s*content: \{\s*text: ([$A-Za-z_][\w$]*)\?\.text \|\| `Executed action: \$\{([$A-Za-z_][\w$]*)\.name\}`,\s*source: "action"\s*\}\s*\};\s*await this\.createMemory\(\1, "messages"\);/g;

let elizaCorePatched = 0;
if (elizaCoreBundleTargets.length === 0) {
  console.log(
    "[patch-deps] @elizaos/core bundle not found, skipping chat patch.",
  );
} else {
  for (const target of elizaCoreBundleTargets) {
    let src = readFileSync(target, "utf8");
    const original = src;

    src = src.replace(coreGeneratedReplyPattern, 'text: "",');
    src = src.replace(
      coreActionMemoryPattern,
      (_match, memoryVar, actionIdVar, messageVar, actionResultVar) =>
        [
          `const actionText = typeof ${actionResultVar}?.text === "string" ? ${actionResultVar}.text.trim() : "";`,
          "        if (actionText) {",
          `          const ${memoryVar} = {`,
          `            id: ${actionIdVar},`,
          "            entityId: this.agentId,",
          `            roomId: ${messageVar}.roomId,`,
          `            worldId: ${messageVar}.worldId,`,
          "            content: {",
          "              text: actionText,",
          '              source: "action"',
          "            }",
          "          };",
          `          await this.createMemory(${memoryVar}, "messages");`,
          "        }",
        ].join("\n"),
    );

    if (src !== original) {
      writeFileSync(target, src, "utf8");
      elizaCorePatched++;
      console.log(`[patch-deps] Applied @elizaos/core chat patch: ${target}`);
    }
  }
  console.log(
    `[patch-deps] @elizaos/core: checked ${elizaCoreBundleTargets.length} file(s), applied ${elizaCorePatched} patch(es).`,
  );
}

/**
 * Patch @pixiv/three-vrm node-material helpers for Three r168+.
 *
 * The published nodes bundle still references THREE_WEBGPU.tslFn in the
 * compatibility helper. Three r182 no longer exports tslFn from three/webgpu,
 * so Vite/Rollup emits a noisy missing-export warning even though the runtime
 * branch would use THREE_TSL.Fn instead. We patch the helper to the modern
 * path directly because this repo pins Three r182.
 */
function findAllThreeVrmNodeFiles() {
  const targets = [];
  const seenRealpaths = new Set();
  const relPaths = ["lib/nodes/index.module.js", "lib/nodes/index.cjs"];
  const searchRoots = [root, resolve(root, "apps/app")];

  for (const searchRoot of searchRoots) {
    for (const relPath of relPaths) {
      addUniquePath(
        targets,
        seenRealpaths,
        resolve(searchRoot, `node_modules/@pixiv/three-vrm/${relPath}`),
      );
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@pixiv+three-vrm@")) {
            for (const relPath of relPaths) {
              addUniquePath(
                targets,
                seenRealpaths,
                resolve(
                  bunCacheDir,
                  entry,
                  `node_modules/@pixiv/three-vrm/${relPath}`,
                ),
              );
            }
          }
        }
      } catch {
        // Ignore bun cache traversal errors.
      }
    }
  }

  return targets;
}

const threeVrmNodeTargets = findAllThreeVrmNodeFiles();
const threeVrmFnCompatBuggy = `return THREE_WEBGPU.tslFn(jsFunc);`;
const threeVrmFnCompatFixed = `return THREE_TSL.Fn(jsFunc);`;

let threeVrmPatched = 0;
if (threeVrmNodeTargets.length === 0) {
  console.log("[patch-deps] three-vrm nodes bundle not found, skipping patch.");
} else {
  for (const target of threeVrmNodeTargets) {
    let src = readFileSync(target, "utf8");

    if (!src.includes(threeVrmFnCompatBuggy)) continue;

    src = src.replaceAll(threeVrmFnCompatBuggy, threeVrmFnCompatFixed);
    writeFileSync(target, src, "utf8");
    threeVrmPatched++;
    console.log(`[patch-deps] Applied three-vrm FnCompat patch: ${target}`);
  }
  console.log(
    `[patch-deps] three-vrm: checked ${threeVrmNodeTargets.length} file(s), applied ${threeVrmPatched} patch(es).`,
  );
}
