#!/usr/bin/env bun
/**
 * Generate hero images for each curated app using fal.ai, writing them to
 * `apps/app/public/app-heroes/<slug>.webp`. The apps page reads those files
 * via the `<slug>` convention (see `AppHero` in
 * `eliza/packages/app-core/src/components/apps/app-identity.tsx`) and falls
 * back to the procedural visual when the file is missing.
 *
 * Usage:
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs            # skip apps that already have an image
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --force    # regenerate everything
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --only=babylon,vincent
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --model=fal-ai/flux/dev
 *
 * Default model is `fal-ai/flux/schnell` (fast + cheap). Switch to
 * `fal-ai/flux/dev` or `fal-ai/flux-pro/new` via --model for higher quality.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "apps/app/public/app-heroes");

const DEFAULT_MODEL = "fal-ai/flux/schnell";
const IMAGE_SIZE = "square_hd"; // fal presets: 1024×1024 is a good square hero.

/**
 * Prompt seeds per curated app. Prompts intentionally describe stylized
 * abstract scenes rather than literal product screenshots — the card already
 * overlays the name and monogram.
 */
const APP_HEROES = [
  {
    slug: "companion",
    prompt:
      "A glowing 3D anime-style companion robot floating in a dreamy pastel cloud space, soft volumetric lighting, vaporwave holographic reflections, delicate sakura petals drifting, high detail digital illustration, no text, cinematic composition.",
  },
  {
    slug: "hyperscape",
    prompt:
      "A vast low-poly 3D sci-fi landscape at dusk with neon plateaus and a distant luminous tower, volumetric fog, cinematic wide vista, vibrant cyan and magenta palette, painterly digital art, no text.",
  },
  {
    slug: "babylon",
    prompt:
      "An abstract futuristic prediction market visualization: layered glass panels with floating candlestick charts, ancient Babylonian ziggurat silhouette in the background fused with neon data streams, deep navy and gold palette, cinematic, no text.",
  },
  {
    slug: "2004scape",
    prompt:
      "A nostalgic early-2000s fantasy MMO landscape scene, stylized medieval village with a gleaming sword on a hilltop, painterly digital art, warm golden-hour light, loosely inspired by classic RuneScape aesthetic, no text.",
  },
  {
    slug: "scape",
    prompt:
      "A painterly fantasy vista with a lone adventurer silhouetted against rolling green hills and distant castles, soft cinematic light, adventure MMO feel, stylized concept art, no text.",
  },
  {
    slug: "defense-of-the-agents",
    prompt:
      "Epic MOBA key art: three glowing arcane champions silhouetted on a three-lane battlefield under a stormy neon sky, fiery vortex overhead, rich saturated fantasy illustration, cinematic tension, no text.",
  },
  {
    slug: "vincent",
    prompt:
      "A polished DeFi vault visualization: a glowing holographic strongbox wrapped in flowing chart ribbons and liquid gold streams, deep navy backdrop with subtle blockchain lattice, clean premium fintech illustration, no text.",
  },
  {
    slug: "shopify",
    prompt:
      "A vibrant abstract commerce flow: floating product parcels, shopping bags, and receipts orbiting a luminous orb, soft mint green and cream palette, premium brand-safe editorial illustration, no text.",
  },
  {
    slug: "clawville",
    prompt:
      "A whimsical neon-lit arcade claw-machine cabinet filled with plush agent creatures, warm carnival lights, retro Y2K toyland vibe, playful stylized illustration, no text.",
  },
  {
    slug: "lifeops",
    prompt:
      "A calm abstract desk scene at dawn: a translucent hovering calendar, sticky notes, checkmarks, and a soft routine clock, muted indigo and peach palette, editorial flat illustration, no text.",
  },
];

function parseArgs(argv) {
  const args = { force: false, only: null, model: DEFAULT_MODEL };
  for (const token of argv.slice(2)) {
    if (token === "--force" || token === "-f") {
      args.force = true;
    } else if (token.startsWith("--only=")) {
      args.only = new Set(
        token
          .slice("--only=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (token.startsWith("--model=")) {
      args.model = token.slice("--model=".length).trim() || DEFAULT_MODEL;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: bun run scripts/generate-app-heroes.mjs [--force] [--only=slug1,slug2] [--model=fal-ai/flux/dev]",
      );
      process.exit(0);
    } else {
      console.warn(`Ignoring unknown argument: ${token}`);
    }
  }
  return args;
}

async function fileExists(file) {
  try {
    const info = await stat(file);
    return info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Submit a generation request to fal.ai and return the first image URL.
 * Uses the synchronous `fal.run` endpoint so we don't have to manage queue
 * state for a short-running batch script.
 */
async function falGenerate({ apiKey, model, prompt }) {
  const endpoint = `https://fal.run/${model}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: IMAGE_SIZE,
      num_images: 1,
      output_format: "webp",
      enable_safety_checker: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `fal.ai returned ${response.status} ${response.statusText}: ${body.slice(0, 400)}`,
    );
  }

  const payload = await response.json();
  const imageUrl = payload?.images?.[0]?.url;
  if (typeof imageUrl !== "string" || !imageUrl) {
    throw new Error(
      `fal.ai response missing images[0].url: ${JSON.stringify(payload).slice(0, 400)}`,
    );
  }
  return imageUrl;
}

async function downloadToFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image (${response.status} ${response.statusText}) from ${url}`,
    );
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, buffer);
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) {
    console.error(
      "FAL_KEY is not set. Export your fal.ai key and retry (see https://fal.ai/dashboard/keys).",
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const targets = APP_HEROES.filter(
    (entry) => !args.only || args.only.has(entry.slug),
  );
  if (args.only && targets.length === 0) {
    console.error(
      `No matching slugs in --only=${[...args.only].join(",")}. Available: ${APP_HEROES.map((e) => e.slug).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `Generating ${targets.length} hero image(s) with ${args.model} → ${path.relative(REPO_ROOT, OUT_DIR)}`,
  );

  let generated = 0;
  let skipped = 0;
  const failures = [];

  for (const entry of targets) {
    const outFile = path.join(OUT_DIR, `${entry.slug}.webp`);
    if (!args.force && (await fileExists(outFile))) {
      console.log(`  skip  ${entry.slug} (already exists)`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`  gen   ${entry.slug} … `);
    try {
      const imageUrl = await falGenerate({
        apiKey,
        model: args.model,
        prompt: entry.prompt,
      });
      await downloadToFile(imageUrl, outFile);
      console.log("ok");
      generated += 1;
    } catch (error) {
      console.log(
        `fail (${error instanceof Error ? error.message : String(error)})`,
      );
      failures.push({ slug: entry.slug, error });
    }
  }

  console.log(
    `\nDone. generated=${generated} skipped=${skipped} failed=${failures.length}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
