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
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchBunExports } from "./lib/patch-bun-exports.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

/**
 * Find ALL plugin-sql dist files - handles both npm and bun cache structures.
 * Returns array of all found paths including BOTH node and browser builds
 * (bun can have multiple copies with different hashes and might use either).
 * Also searches the eliza submodule's node_modules.
 */
function findAllPluginSqlDists() {
  const targets = [];
  const distPaths = [
    "dist/node/index.node.js",
    "dist/browser/index.browser.js",
  ];

  // Search roots: main project, eliza submodule, plugin submodules, and global node_modules
  const searchRoots = [root];
  const elizaRoot = resolve(root, "eliza");
  if (existsSync(resolve(elizaRoot, "node_modules"))) {
    searchRoots.push(elizaRoot);
  }

  // Also check global node_modules in home directory (bun may resolve from there)
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  // Also check for plugin-sql as a local plugin submodule
  const pluginSqlRoot = resolve(root, "plugins/plugin-sql/typescript");
  if (existsSync(pluginSqlRoot)) {
    for (const distPath of distPaths) {
      const pluginTarget = resolve(pluginSqlRoot, distPath);
      if (existsSync(pluginTarget) && !targets.includes(pluginTarget)) {
        targets.push(pluginTarget);
      }
    }
  }

  for (const searchRoot of searchRoots) {
    // Standard npm location
    for (const distPath of distPaths) {
      const npmTarget = resolve(
        searchRoot,
        `node_modules/@elizaos/plugin-sql/${distPath}`,
      );
      if (existsSync(npmTarget) && !targets.includes(npmTarget)) {
        targets.push(npmTarget);
      }
    }

    // Bun cache location (node_modules/.bun/@elizaos+plugin-sql@*/...)
    // Bun can have multiple copies with different content hashes
    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@elizaos+plugin-sql@")) {
            for (const distPath of distPaths) {
              const bunTarget = resolve(
                bunCacheDir,
                entry,
                `node_modules/@elizaos/plugin-sql/${distPath}`,
              );
              if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
                targets.push(bunTarget);
              }
            }
          }
        }
      } catch {
        // Ignore errors reading bun cache
      }
    }
  }

  return targets;
}

const targets = findAllPluginSqlDists();

if (targets.length === 0) {
  console.log("[patch-deps] plugin-sql dist not found, skipping patch.");
  process.exit(0);
}

console.log(
  `[patch-deps] Found ${targets.length} plugin-sql dist file(s) to patch.`,
);

// Patch definitions
const createWorldBuggy = `await this.db.insert(worldTable).values({
        ...world,
        id: newWorldId,
        name: world.name || ""
      });`;

const createWorldFixed = `await this.db.insert(worldTable).values({
        ...world,
        id: newWorldId,
        name: world.name || ""
      }).onConflictDoNothing();`;

const embeddingBuggy = `this.embeddingDimension = DIMENSION_MAP[dimension];`;
const embeddingFixed = `const resolvedDimension = DIMENSION_MAP[dimension];
				if (!resolvedDimension) {
					const fallbackDimension = this.embeddingDimension ?? DIMENSION_MAP[384];
					this.embeddingDimension = fallbackDimension;
					logger10.warn(
						{
							src: "plugin:sql",
							requestedDimension: dimension,
							fallbackDimension,
						},
						"Unsupported embedding dimension requested; keeping fallback embedding column",
					);
					return;
				}
				this.embeddingDimension = resolvedDimension;`;

// Patch: Remove pgcrypto from extension list entirely
// pgcrypto is not used in the codebase and PGlite doesn't support it
// We check for multiple patterns since we may have already partially patched
const extensionsPatterns = [
  // Original unpatched code (newer format)
  `const extensions = isRealPostgres ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`,
  // Previously patched with isPglite check
  `const isPglite = !!process.env.PGLITE_DATA_DIR;
      const extensions = isRealPostgres && !isPglite ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`,
];
// Fixed: just never include pgcrypto - it's not used and causes PGlite warnings
const extensionsNoPgcrypto = `const extensions = ["vector", "fuzzystrmatch"];`;

// Older format: extensions passed directly to installRequiredExtensions
const extensionsInlinePatterns = [
  // Hardcoded array with pgcrypto
  `await this.extensionManager.installRequiredExtensions([
        "vector",
        "fuzzystrmatch",
        "pgcrypto"
      ]);`,
  // Single-line variant
  `await this.extensionManager.installRequiredExtensions(["vector", "fuzzystrmatch", "pgcrypto"]);`,
];
const extensionsInlineFixed = `await this.extensionManager.installRequiredExtensions([
        "vector",
        "fuzzystrmatch"
      ]);`;

// Apply patches to each found plugin-sql dist file
for (const target of targets) {
  console.log(`[patch-deps] Patching: ${target}`);
  let src = readFileSync(target, "utf8");
  let patched = 0;

  if (src.includes(createWorldFixed)) {
    console.log("  - createWorld conflict patch already present.");
  } else if (src.includes(createWorldBuggy)) {
    src = src.replace(createWorldBuggy, createWorldFixed);
    patched += 1;
    console.log("  - Applied createWorld onConflictDoNothing() patch.");
  } else {
    console.log(
      "  - createWorld() signature changed — world patch may no longer be needed.",
    );
  }

  if (src.includes(embeddingFixed)) {
    console.log("  - ensureEmbeddingDimension guard patch already present.");
  } else if (src.includes(embeddingBuggy)) {
    src = src.replace(embeddingBuggy, embeddingFixed);
    patched += 1;
    console.log("  - Applied ensureEmbeddingDimension guard patch.");
  } else {
    console.log(
      "  - ensureEmbeddingDimension signature changed — embedding patch may no longer be needed.",
    );
  }

  // Check for pgcrypto removal (const extensions = ... pattern)
  if (src.includes(extensionsNoPgcrypto)) {
    console.log("  - pgcrypto removal patch already present.");
  } else {
    let pgcryptoPatched = false;
    for (const pattern of extensionsPatterns) {
      if (src.includes(pattern)) {
        src = src.replace(pattern, extensionsNoPgcrypto);
        patched += 1;
        pgcryptoPatched = true;
        console.log("  - Removed pgcrypto from extensions list.");
        break;
      }
    }
    if (!pgcryptoPatched) {
      // Check for inline pattern (older code format)
      for (const pattern of extensionsInlinePatterns) {
        if (src.includes(pattern)) {
          src = src.replace(pattern, extensionsInlineFixed);
          patched += 1;
          pgcryptoPatched = true;
          console.log("  - Removed pgcrypto from inline extensions call.");
          break;
        }
      }
    }
    if (!pgcryptoPatched && !src.includes(extensionsInlineFixed)) {
      console.log(
        "  - Extension installation code changed — pgcrypto patch may no longer be needed.",
      );
    } else if (!pgcryptoPatched && src.includes(extensionsInlineFixed)) {
      console.log("  - pgcrypto inline removal patch already present.");
    }
  }

  if (patched > 0) {
    writeFileSync(target, src, "utf8");
    console.log(`  - Wrote ${patched} patch(es) to this file.`);
  } else {
    console.log("  - No patches needed for this file.");
  }
}

/**
 * Patch @elizaos/plugin-elizacloud (next tag currently points to alpha.4)
 * to avoid AI SDK warnings from unsupported params on Responses API models.
 */
const cloudTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-elizacloud/dist/node/index.node.js",
);

if (!existsSync(cloudTarget)) {
  console.log("[patch-deps] plugin-elizacloud dist not found, skipping patch.");
} else {
  let cloudSrc = readFileSync(cloudTarget, "utf8");
  let cloudPatched = 0;

  const cloudBuggy = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt, stopSequences = [] } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const maxTokens = params.maxTokens ?? 8192;
  const openai = createOpenAIClient(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  const model = openai.languageModel(modelName);
  const generateParams = {
    model,
    prompt,
    system: runtime.character.system ?? undefined,
    temperature,
    maxOutputTokens: maxTokens,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  const cloudFixed = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt } = params;
  const maxTokens = params.maxTokens ?? 8192;
  const openai = createOpenAIClient(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  const model = openai.chat(modelName);
  const lowerModelName = modelName.toLowerCase();
  const supportsStopSequences = !lowerModelName.startsWith("openai/") && !lowerModelName.startsWith("anthropic/") && !["o1", "o3", "o4", "gpt-5", "gpt-5-mini"].some((pattern) => lowerModelName.includes(pattern));
  const stopSequences = supportsStopSequences && Array.isArray(params.stopSequences) && params.stopSequences.length > 0 ? params.stopSequences : void 0;
  const generateParams = {
    model,
    prompt,
    system: runtime.character.system ?? undefined,
    ...(stopSequences ? { stopSequences } : {}),
    maxOutputTokens: maxTokens,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  if (cloudSrc.includes(cloudFixed)) {
    console.log("[patch-deps] elizacloud warning patch already present.");
  } else if (cloudSrc.includes(cloudBuggy)) {
    cloudSrc = cloudSrc.replace(cloudBuggy, cloudFixed);
    cloudPatched += 1;
    console.log("[patch-deps] Applied elizacloud responses-compat patch.");
  } else {
    console.log(
      "[patch-deps] elizacloud buildGenerateParams signature changed; skip patch.",
    );
  }

  if (cloudPatched > 0) {
    writeFileSync(cloudTarget, cloudSrc, "utf8");
    console.log(
      `[patch-deps] Wrote ${cloudPatched} plugin-elizacloud patch(es).`,
    );
  }
}

/**
 * Patch @elizaos/plugin-openrouter (next tag currently points to alpha.5)
 * so unsupported sampling params are not forced for Responses-routed models.
 */
const openrouterTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-openrouter/dist/node/index.node.js",
);

if (!existsSync(openrouterTarget)) {
  console.log("[patch-deps] plugin-openrouter dist not found, skipping patch.");
} else {
  let openrouterSrc = readFileSync(openrouterTarget, "utf8");
  let openrouterPatched = 0;

  const openrouterBuggy = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt, stopSequences = [] } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const paramsWithMax = params;
  const resolvedMaxOutput = paramsWithMax.maxOutputTokens ?? paramsWithMax.maxTokens ?? 8192;
  const openrouter = createOpenRouterProvider(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const generateParams = {
    model: openrouter.chat(modelName),
    prompt,
    system: runtime.character?.system ?? undefined,
    temperature,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    maxOutputTokens: resolvedMaxOutput
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  const openrouterFixed = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const paramsWithMax = params;
  const resolvedMaxOutput = paramsWithMax.maxOutputTokens ?? paramsWithMax.maxTokens ?? 8192;
  const openrouter = createOpenRouterProvider(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const lowerModelName = modelName.toLowerCase();
  const supportsSampling = !lowerModelName.startsWith("openai/") && !lowerModelName.startsWith("anthropic/") && !["o1", "o3", "o4", "gpt-5", "gpt-5-mini"].some((pattern) => lowerModelName.includes(pattern));
  const stopSequences = supportsSampling && Array.isArray(params.stopSequences) && params.stopSequences.length > 0 ? params.stopSequences : void 0;
  const generateParams = {
    model: openrouter.chat(modelName),
    prompt,
    system: runtime.character?.system ?? undefined,
    ...(supportsSampling ? {
      temperature,
      frequencyPenalty,
      presencePenalty,
      ...(stopSequences ? {
        stopSequences
      } : {})
    } : {}),
    maxOutputTokens: resolvedMaxOutput
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  if (openrouterSrc.includes(openrouterFixed)) {
    console.log("[patch-deps] openrouter sampling patch already present.");
  } else if (openrouterSrc.includes(openrouterBuggy)) {
    openrouterSrc = openrouterSrc.replace(openrouterBuggy, openrouterFixed);
    openrouterPatched += 1;
    console.log("[patch-deps] Applied openrouter sampling-compat patch.");
  } else {
    console.log(
      "[patch-deps] openrouter buildGenerateParams signature changed; skip patch.",
    );
  }

  if (openrouterPatched > 0) {
    writeFileSync(openrouterTarget, openrouterSrc, "utf8");
    console.log(
      `[patch-deps] Wrote ${openrouterPatched} plugin-openrouter patch(es).`,
    );
  }
}

/**
 * Patch @elizaos/plugin-twitter POST_TWEET action to upload image attachments.
 *
 * The action handler only passes text to sendTweet(), ignoring any
 * message.content.attachments (e.g. images sent from the chat UI).
 * This patch reads image data from the non-standard `_data`/`_mimeType` fields
 * that Milady sets on attachments (keeping the `url` field compact to avoid
 * bloating the LLM context window with base64 strings).
 *
 * Remove once plugin-twitter ships native attachment support.
 */
const twitterTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-twitter/dist/index.js",
);

if (!existsSync(twitterTarget)) {
  console.log("[patch-deps] plugin-twitter dist not found, skipping patch.");
} else {
  let twitterSrc = readFileSync(twitterTarget, "utf8");

  // Original unpatched code.
  const twitterBuggy = `      const result = await client.twitterClient.sendTweet(finalTweetText);`;

  // v1 patch (url-based — reads base64 from att.url, may already be applied).
  const twitterV1Fixed = `      // Upload any image attachments from the user's chat message
      const imageAttachments = message.content?.attachments?.filter(
        (att) => att.contentType === "image" || (att.url && att.url.startsWith("data:image/"))
      ) ?? [];
      const tweetMediaIds = [];
      for (const att of imageAttachments) {
        try {
          const dataUrl = att.url ?? "";
          const commaIdx = dataUrl.indexOf(",");
          if (commaIdx === -1) continue;
          const base64Data = dataUrl.slice(commaIdx + 1);
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const buffer = Buffer.from(base64Data, "base64");
          const mediaId = await client.twitterClient.uploadMedia(buffer, { mimeType });
          tweetMediaIds.push(mediaId);
        } catch (mediaErr) {
          logger14.warn("Failed to upload tweet media attachment:", mediaErr);
        }
      }
      const result = await client.twitterClient.sendTweet(
        finalTweetText,
        void 0,
        void 0,
        void 0,
        tweetMediaIds.length > 0 ? tweetMediaIds : void 0
      );`;

  // v2 patch — reads base64 from att._data/_mimeType so the url field stays
  // compact (attachment:img-0) and doesn't consume LLM context tokens.
  const twitterFixed = `      // Upload any image attachments from the user's chat message
      const imageAttachments = message.content?.attachments?.filter(
        (att) => att.contentType === "image" && (att._data || (att.url && att.url.startsWith("data:image/")))
      ) ?? [];
      const tweetMediaIds = [];
      for (const att of imageAttachments) {
        try {
          let base64Data, mimeType;
          if (att._data) {
            base64Data = att._data;
            mimeType = att._mimeType || "image/jpeg";
          } else {
            const dataUrl = att.url ?? "";
            const commaIdx = dataUrl.indexOf(",");
            if (commaIdx === -1) continue;
            base64Data = dataUrl.slice(commaIdx + 1);
            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
            mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          }
          const buffer = Buffer.from(base64Data, "base64");
          const mediaId = await client.twitterClient.uploadMedia(buffer, { mimeType });
          tweetMediaIds.push(mediaId);
        } catch (mediaErr) {
          logger14.warn("Failed to upload tweet media attachment:", mediaErr);
        }
      }
      const result = await client.twitterClient.sendTweet(
        finalTweetText,
        void 0,
        void 0,
        void 0,
        tweetMediaIds.length > 0 ? tweetMediaIds : void 0
      );`;

  // v2 is uniquely identified by reading from att._data (not att.url)
  const twitterV2Marker = `if (att._data) {`;
  if (twitterSrc.includes(twitterV2Marker)) {
    console.log(
      "[patch-deps] twitter POST_TWEET media patch (v2) already present.",
    );
  } else if (twitterSrc.includes(twitterV1Fixed.slice(0, 80))) {
    twitterSrc = twitterSrc.replace(twitterV1Fixed, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log("[patch-deps] Upgraded twitter POST_TWEET media patch to v2.");
  } else if (twitterSrc.includes(twitterBuggy)) {
    twitterSrc = twitterSrc.replace(twitterBuggy, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log(
      "[patch-deps] Applied twitter POST_TWEET media upload patch (v2).",
    );
  } else {
    console.log(
      "[patch-deps] twitter POST_TWEET sendTweet call changed — media patch may no longer be needed.",
    );
  }
}

/**
 * Patch @elizaos/plugin-pdf to fix ESM compatibility with pdfjs-dist.
 *
 * pdfjs-dist doesn't provide a default export in ESM mode, so
 * `import pkg from "pdfjs-dist"` fails. We patch it to use namespace import.
 *
 * Remove once plugin-pdf publishes a fix for ESM compatibility.
 */
function findAllPluginPdfDists() {
  const targets = [];
  const distPaths = [
    "dist/node/index.node.js",
    "dist/browser/index.browser.js",
  ];

  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  for (const searchRoot of searchRoots) {
    for (const distPath of distPaths) {
      const npmTarget = resolve(
        searchRoot,
        `node_modules/@elizaos/plugin-pdf/${distPath}`,
      );
      if (existsSync(npmTarget) && !targets.includes(npmTarget)) {
        targets.push(npmTarget);
      }
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@elizaos+plugin-pdf@")) {
            for (const distPath of distPaths) {
              const bunTarget = resolve(
                bunCacheDir,
                entry,
                `node_modules/@elizaos/plugin-pdf/${distPath}`,
              );
              if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
                targets.push(bunTarget);
              }
            }
          }
        }
      } catch {
        // Ignore errors reading bun cache
      }
    }
  }

  return targets;
}

const pdfTargets = findAllPluginPdfDists();

if (pdfTargets.length === 0) {
  console.log("[patch-deps] plugin-pdf dist not found, skipping patch.");
} else {
  console.log(
    `[patch-deps] Found ${pdfTargets.length} plugin-pdf dist file(s) to patch.`,
  );

  // Use regex to match various minified patterns of the default import
  // Pattern: import <var> from "pdfjs-dist" or import <var> from"pdfjs-dist"
  const pdfBuggyImportRegex = /import\s+(\w+)\s+from\s*"pdfjs-dist"/g;

  for (const target of pdfTargets) {
    console.log(`[patch-deps] Patching plugin-pdf: ${target}`);
    let src = readFileSync(target, "utf8");
    let patched = false;

    if (src.includes("import * as") && src.includes("pdfjs-dist")) {
      console.log("  - pdfjs-dist ESM import patch already present.");
    } else {
      // Find all default imports from pdfjs-dist and replace with namespace imports
      const matches = [...src.matchAll(pdfBuggyImportRegex)];
      if (matches.length > 0) {
        for (const match of matches) {
          const varName = match[1];
          const originalImport = match[0];
          const fixedImport = `import * as ${varName} from "pdfjs-dist"`;
          src = src.replace(originalImport, fixedImport);
          patched = true;
        }
        if (patched) {
          console.log(
            `  - Applied pdfjs-dist ESM namespace import patch (${matches.length} occurrence(s)).`,
          );
        }
      } else if (src.includes("pdfjs-dist")) {
        console.log(
          "  - pdfjs-dist import pattern changed — patch may need updating.",
        );
      } else {
        console.log(
          "  - pdfjs-dist import not found — patch may no longer be needed.",
        );
      }
    }

    if (patched) {
      writeFileSync(target, src, "utf8");
      console.log("  - Wrote pdfjs-dist ESM patch.");
    }
  }
}

/**
 * Patch html-encoding-sniffer to avoid its CommonJS require() of
 * @exodus/bytes/encoding-lite.js, which is currently published as ESM and
 * crashes Bun/Vitest worker startup when jsdom boots.
 *
 * The upstream package only needs BOM detection + a small label normalizer.
 * For our test/runtime usage, a minimal inlined implementation is sufficient.
 */
function findHtmlEncodingSnifferFiles() {
  const targets = [];
  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  for (const searchRoot of searchRoots) {
    const directTarget = resolve(
      searchRoot,
      "node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js",
    );
    if (existsSync(directTarget) && !targets.includes(directTarget)) {
      targets.push(directTarget);
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("html-encoding-sniffer@")) {
            const bunTarget = resolve(
              bunCacheDir,
              entry,
              "node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js",
            );
            if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
              targets.push(bunTarget);
            }
          }
        }
      } catch {
        // Ignore cache traversal errors
      }
    }

    const nodeModulesDir = resolve(searchRoot, "node_modules");
    if (existsSync(nodeModulesDir)) {
      try {
        const entries = readdirSync(nodeModulesDir);
        for (const entry of entries) {
          if (!entry.startsWith(".old_modules-")) continue;
          const legacyTarget = resolve(
            nodeModulesDir,
            entry,
            "html-encoding-sniffer/lib/html-encoding-sniffer.js",
          );
          if (existsSync(legacyTarget) && !targets.includes(legacyTarget)) {
            targets.push(legacyTarget);
          }
        }
      } catch {
        // Ignore legacy-module traversal errors
      }
    }
  }

  return targets;
}

const htmlEncodingBuggyImport = `const { getBOMEncoding, labelToName } = require("@exodus/bytes/encoding-lite.js");`;
const htmlEncodingPatchedPrelude = `function getBOMEncoding(uint8Array) {
  if (!uint8Array || uint8Array.byteLength < 2) return null;
  if (
    uint8Array.byteLength >= 3 &&
    uint8Array[0] === 0xEF &&
    uint8Array[1] === 0xBB &&
    uint8Array[2] === 0xBF
  ) {
    return "UTF-8";
  }
  if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
    return "UTF-16BE";
  }
  if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
    return "UTF-16LE";
  }
  return null;
}

const ENCODING_LABELS = new Map([
  ["utf-8", "UTF-8"],
  ["utf8", "UTF-8"],
  ["unicode-1-1-utf-8", "UTF-8"],
  ["utf-16", "UTF-16LE"],
  ["utf-16le", "UTF-16LE"],
  ["utf-16be", "UTF-16BE"],
  ["windows-1252", "windows-1252"],
  ["cp1252", "windows-1252"],
  ["x-user-defined", "x-user-defined"],
]);

function labelToName(label) {
  if (label === null || label === undefined) return null;
  const normalized = String(label).trim().toLowerCase();
  return ENCODING_LABELS.get(normalized) ?? null;
}`;

const htmlEncodingTargets = findHtmlEncodingSnifferFiles();

if (htmlEncodingTargets.length === 0) {
  console.log(
    "[patch-deps] html-encoding-sniffer not found, skipping compatibility patch.",
  );
} else {
  console.log(
    `[patch-deps] Found ${htmlEncodingTargets.length} html-encoding-sniffer file(s) to patch.`,
  );
  for (const target of htmlEncodingTargets) {
    console.log(`[patch-deps] Patching html-encoding-sniffer: ${target}`);
    let src = readFileSync(target, "utf8");
    if (src.includes("const ENCODING_LABELS = new Map([")) {
      console.log(
        "  - html-encoding-sniffer compatibility patch already present.",
      );
      continue;
    }
    if (!src.includes(htmlEncodingBuggyImport)) {
      console.log(
        "  - html-encoding-sniffer import signature changed — patch may need updating.",
      );
      continue;
    }
    src = src.replace(htmlEncodingBuggyImport, htmlEncodingPatchedPrelude);
    writeFileSync(target, src, "utf8");
    console.log("  - Wrote html-encoding-sniffer compatibility patch.");
  }
}

/**
 * Create a local CommonJS @exodus/bytes shim under packages that still use
 * require("@exodus/bytes/..."). Bun currently installs @exodus/bytes as ESM,
 * which breaks jsdom/whatwg-url/html-encoding-sniffer worker startup.
 */
function findBytesShimHostPackageDirs() {
  const targets = [];
  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  const packageNames = ["jsdom", "whatwg-url", "html-encoding-sniffer"];

  for (const searchRoot of searchRoots) {
    for (const packageName of packageNames) {
      const directTarget = resolve(searchRoot, `node_modules/${packageName}`);
      if (existsSync(directTarget) && !targets.includes(directTarget)) {
        targets.push(directTarget);
      }
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          for (const packageName of packageNames) {
            if (!entry.startsWith(`${packageName}@`)) continue;
            const bunTarget = resolve(
              bunCacheDir,
              entry,
              `node_modules/${packageName}`,
            );
            if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
              targets.push(bunTarget);
            }
          }
        }
      } catch {
        // Ignore cache traversal errors
      }
    }
  }

  return targets;
}

const bytesShimPackageJson = `{
  "name": "@exodus/bytes",
  "private": true,
  "type": "commonjs"
}
`;

const bytesEncodingShim = `"use strict";

const NativeTextDecoder = globalThis.TextDecoder;
const NativeTextEncoder = globalThis.TextEncoder;
const NativeTextDecoderStream = globalThis.TextDecoderStream;
const NativeTextEncoderStream = globalThis.TextEncoderStream;

function normalizeEncoding(label) {
  if (label === null || label === undefined) return null;
  const normalized = String(label).trim().toLowerCase();
  if (!normalized) return null;
  switch (normalized) {
    case "utf8":
    case "utf-8":
    case "unicode-1-1-utf-8":
      return "UTF-8";
    case "utf-16":
    case "utf-16le":
      return "UTF-16LE";
    case "utf-16be":
      return "UTF-16BE";
    case "windows-1252":
    case "cp1252":
    case "latin1":
    case "iso-8859-1":
      return "windows-1252";
    case "x-user-defined":
      return "x-user-defined";
    default:
      return null;
  }
}

function labelToName(label) {
  return normalizeEncoding(label);
}

function getBOMEncoding(uint8Array) {
  if (!uint8Array || uint8Array.byteLength < 2) return null;
  if (
    uint8Array.byteLength >= 3 &&
    uint8Array[0] === 0xEF &&
    uint8Array[1] === 0xBB &&
    uint8Array[2] === 0xBF
  ) {
    return "UTF-8";
  }
  if (uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
    return "UTF-16BE";
  }
  if (uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
    return "UTF-16LE";
  }
  return null;
}

function decodeUtf16Be(uint8Array) {
  const bytes = Buffer.from(uint8Array);
  const swapped = Buffer.allocUnsafe(bytes.length);
  for (let i = 0; i < bytes.length - 1; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  if (bytes.length % 2 === 1) {
    swapped[bytes.length - 1] = bytes[bytes.length - 1];
  }
  return new NativeTextDecoder("utf-16le").decode(swapped);
}

function legacyHookDecode(uint8Array, label = "windows-1252") {
  const encoding = normalizeEncoding(label) || "windows-1252";
  if (encoding === "UTF-8") {
    return new NativeTextDecoder("utf-8").decode(uint8Array);
  }
  if (encoding === "UTF-16LE") {
    return new NativeTextDecoder("utf-16le").decode(uint8Array);
  }
  if (encoding === "UTF-16BE") {
    return decodeUtf16Be(uint8Array);
  }
  return Buffer.from(uint8Array).toString("latin1");
}

module.exports = {
  TextDecoder: NativeTextDecoder,
  TextEncoder: NativeTextEncoder,
  TextDecoderStream: NativeTextDecoderStream,
  TextEncoderStream: NativeTextEncoderStream,
  normalizeEncoding,
  getBOMEncoding,
  labelToName,
  legacyHookDecode,
};
`;

const bytesBase64Shim = `"use strict";

function toBase64(input) {
  return Buffer.from(input).toString("base64");
}

module.exports = { toBase64 };
`;

const bytesWhatwgShim = `"use strict";

function shouldPercentEncode(byte, percentEncodeSet) {
  const ch = String.fromCharCode(byte);
  if (typeof percentEncodeSet === "function") {
    return Boolean(percentEncodeSet(byte));
  }
  if (typeof percentEncodeSet === "string") {
    return byte < 0x20 || byte > 0x7E || percentEncodeSet.includes(ch);
  }
  if (percentEncodeSet && typeof percentEncodeSet.has === "function") {
    return (
      byte < 0x20 ||
      byte > 0x7E ||
      percentEncodeSet.has(byte) ||
      percentEncodeSet.has(ch)
    );
  }
  if (Array.isArray(percentEncodeSet)) {
    return (
      byte < 0x20 ||
      byte > 0x7E ||
      percentEncodeSet.includes(byte) ||
      percentEncodeSet.includes(ch)
    );
  }
  return byte < 0x20 || byte > 0x7E;
}

function percentEncodeAfterEncoding(_encoding, input, percentEncodeSet, spaceAsPlus = false) {
  const bytes = Buffer.from(String(input), "utf8");
  let output = "";
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    if (spaceAsPlus && ch === " ") {
      output += "+";
      continue;
    }
    if (shouldPercentEncode(byte, percentEncodeSet)) {
      output += \`%\${byte.toString(16).toUpperCase().padStart(2, "0")}\`;
      continue;
    }
    output += ch;
  }
  return output;
}

module.exports = { percentEncodeAfterEncoding };
`;

const bytesShimHosts = findBytesShimHostPackageDirs();

if (bytesShimHosts.length === 0) {
  console.log(
    "[patch-deps] No jsdom/whatwg-url/html-encoding-sniffer hosts found for @exodus/bytes shim.",
  );
} else {
  console.log(
    `[patch-deps] Installing @exodus/bytes CommonJS shims for ${bytesShimHosts.length} host package(s).`,
  );
  for (const hostDir of bytesShimHosts) {
    const shimDir = resolve(hostDir, "node_modules/@exodus/bytes");
    mkdirSync(shimDir, { recursive: true });
    writeFileSync(
      resolve(shimDir, "package.json"),
      bytesShimPackageJson,
      "utf8",
    );
    writeFileSync(resolve(shimDir, "encoding.js"), bytesEncodingShim, "utf8");
    writeFileSync(
      resolve(shimDir, "encoding-lite.js"),
      bytesEncodingShim,
      "utf8",
    );
    writeFileSync(resolve(shimDir, "whatwg.js"), bytesWhatwgShim, "utf8");
    writeFileSync(resolve(shimDir, "base64.js"), bytesBase64Shim, "utf8");
    console.log(`  - Installed shim under ${shimDir}`);
  }
}

/**
 * Create a local CommonJS @asamuzakjp/css-color shim under cssstyle so its
 * CommonJS parser can bootstrap under Bun/Vitest without requiring the ESM
 * upstream package. This only implements the small surface cssstyle reads.
 */
function findCssColorShimHostPackageDirs() {
  const targets = [];
  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  for (const searchRoot of searchRoots) {
    const directTarget = resolve(searchRoot, "node_modules/cssstyle");
    if (existsSync(directTarget) && !targets.includes(directTarget)) {
      targets.push(directTarget);
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (!entry.startsWith("cssstyle@")) continue;
          const bunTarget = resolve(
            bunCacheDir,
            entry,
            "node_modules/cssstyle",
          );
          if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
            targets.push(bunTarget);
          }
        }
      } catch {
        // Ignore cache traversal errors
      }
    }
  }

  return targets;
}

const cssColorShimPackageJson = `{
  "name": "@asamuzakjp/css-color",
  "private": true,
  "type": "commonjs",
  "main": "index.js"
}
`;

const cssColorShim = `"use strict";

function prepareValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitTopLevel(input, delimiter = " ") {
  const source = prepareValue(input);
  if (!source) return [];

  const parts = [];
  let current = "";
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote = "";
  let escaped = false;
  let sawWhitespaceSeparator = false;

  function pushCurrent() {
    if (delimiter === " ") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
    } else {
      parts.push(current.trim());
    }
    current = "";
  }

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (quote) {
      current += ch;
      if (ch === "\\\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "(") depthParen += 1;
    else if (ch === ")" && depthParen > 0) depthParen -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]" && depthBracket > 0) depthBracket -= 1;
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}" && depthBrace > 0) depthBrace -= 1;

    const atTopLevel =
      depthParen === 0 && depthBracket === 0 && depthBrace === 0;

    if (atTopLevel && delimiter === " " && /\\s/.test(ch)) {
      if (!sawWhitespaceSeparator) {
        pushCurrent();
      }
      sawWhitespaceSeparator = true;
      continue;
    }

    if (atTopLevel && delimiter !== " " && source.startsWith(delimiter, i)) {
      pushCurrent();
      i += delimiter.length - 1;
      sawWhitespaceSeparator = false;
      continue;
    }

    sawWhitespaceSeparator = false;
    current += ch;
  }

  if (current || delimiter !== " ") {
    pushCurrent();
  }

  return delimiter === " " ? parts : parts.map((part) => part.trim());
}

function resolve(value) {
  const normalized = prepareValue(value);
  return normalized || undefined;
}

function cssCalc(value) {
  return resolve(value);
}

function resolveGradient(value) {
  return resolve(value);
}

function splitValue(value, options = {}) {
  const delimiter =
    typeof options?.delimiter === "string" && options.delimiter.length > 0
      ? options.delimiter
      : " ";
  return splitTopLevel(value, delimiter);
}

module.exports = {
  resolve,
  utils: {
    cssCalc,
    resolveGradient,
    splitValue,
  },
};
`;

const cssColorShimHosts = findCssColorShimHostPackageDirs();

if (cssColorShimHosts.length === 0) {
  console.log(
    "[patch-deps] No cssstyle hosts found for @asamuzakjp/css-color shim.",
  );
} else {
  console.log(
    `[patch-deps] Installing @asamuzakjp/css-color CommonJS shims for ${cssColorShimHosts.length} cssstyle host package(s).`,
  );
  for (const hostDir of cssColorShimHosts) {
    const shimDir = resolve(hostDir, "node_modules/@asamuzakjp/css-color");
    mkdirSync(shimDir, { recursive: true });
    writeFileSync(
      resolve(shimDir, "package.json"),
      cssColorShimPackageJson,
      "utf8",
    );
    writeFileSync(resolve(shimDir, "index.js"), cssColorShim, "utf8");
    console.log(`  - Installed shim under ${shimDir}`);
  }
}

function findFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findEsbuildMainPath() {
  const candidates = [resolve(root, "node_modules/esbuild/lib/main.js")];

  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      const entries = readdirSync(bunCacheDir)
        .filter((entry) => entry.startsWith("esbuild@"))
        .sort()
        .reverse();
      for (const entry of entries) {
        candidates.push(
          resolve(bunCacheDir, entry, "node_modules/esbuild/lib/main.js"),
        );
      }
    } catch {
      // Ignore cache traversal errors
    }
  }

  return findFirstExistingPath(candidates);
}

function findParse5EntryPath() {
  const candidates = [resolve(root, "node_modules/parse5/dist/index.js")];

  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      const entries = readdirSync(bunCacheDir)
        .filter((entry) => entry.startsWith("parse5@"))
        .sort()
        .reverse();
      for (const entry of entries) {
        candidates.push(
          resolve(bunCacheDir, entry, "node_modules/parse5/dist/index.js"),
        );
      }
    } catch {
      // Ignore cache traversal errors
    }
  }

  return findFirstExistingPath(candidates);
}

function findParse5ShimHostPackageDirs() {
  const targets = [];
  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  for (const searchRoot of searchRoots) {
    const directTarget = resolve(searchRoot, "node_modules/jsdom");
    if (existsSync(directTarget) && !targets.includes(directTarget)) {
      targets.push(directTarget);
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (!entry.startsWith("jsdom@")) continue;
          const bunTarget = resolve(bunCacheDir, entry, "node_modules/jsdom");
          if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
            targets.push(bunTarget);
          }
        }
      } catch {
        // Ignore cache traversal errors
      }
    }
  }

  return targets;
}

const parse5ShimPackageJson = `{
  "name": "parse5",
  "private": true,
  "type": "commonjs",
  "main": "index.js"
}
`;

const parse5ShimIndex = `"use strict";

module.exports = require("./dist/index.cjs");
`;

const parse5ShimHosts = findParse5ShimHostPackageDirs();
const esbuildMainPath = findEsbuildMainPath();
const parse5EntryPath = findParse5EntryPath();

if (parse5ShimHosts.length === 0) {
  console.log("[patch-deps] No jsdom hosts found for parse5 shim.");
} else if (!esbuildMainPath || !parse5EntryPath) {
  console.log(
    "[patch-deps] Missing esbuild or parse5 entry; skipping parse5 CommonJS shim.",
  );
} else {
  console.log(
    `[patch-deps] Installing parse5 CommonJS shims for ${parse5ShimHosts.length} jsdom host package(s).`,
  );
  const { buildSync } = require(esbuildMainPath);
  for (const hostDir of parse5ShimHosts) {
    const shimDir = resolve(hostDir, "node_modules/parse5");
    const distDir = resolve(shimDir, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      resolve(shimDir, "package.json"),
      parse5ShimPackageJson,
      "utf8",
    );
    writeFileSync(resolve(shimDir, "index.js"), parse5ShimIndex, "utf8");
    buildSync({
      entryPoints: [parse5EntryPath],
      outfile: resolve(distDir, "index.cjs"),
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node22",
      logLevel: "silent",
    });
    console.log(`  - Installed shim under ${shimDir}`);
  }
}

// ---------------------------------------------------------------------------
// Patch @elizaos packages whose exports["."].bun points to ./src/index.ts.
// Logic lives in scripts/lib/patch-bun-exports.mjs (testable).
// ---------------------------------------------------------------------------
patchBunExports(root, "@elizaos/plugin-coding-agent");
