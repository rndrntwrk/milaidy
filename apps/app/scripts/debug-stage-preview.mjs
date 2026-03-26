import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const previewPort = Number(process.env.ALICE_STAGE_DEBUG_PORT) || 2143;
const capturePath = "stage-debug.html";
const outputDir = path.resolve(appRoot, "output/playwright");
const headed = process.env.ALICE_STAGE_DEBUG_HEADED === "1";

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function capturePageState(page, name) {
  await page.screenshot({
    path: path.resolve(outputDir, `${name}.png`),
    fullPage: true,
  });
}

async function main() {
  await ensureDir(outputDir);

  let server;
  let browser;
  let page;

  const consoleLines = [];
  const pageErrors = [];
  const stateSamples = [];

  try {
    server = await createServer({
      configFile: path.resolve(appRoot, "vite.config.ts"),
      clearScreen: false,
      logLevel: "error",
      server: {
        host: "127.0.0.1",
        port: previewPort,
        strictPort: true,
      },
    });

    await server.listen();

    const baseUrl =
      server.resolvedUrls?.local?.[0] ??
      `http://127.0.0.1:${previewPort}/`;
    const captureUrl = new URL(capturePath, baseUrl).toString();

    browser = await chromium.launch({
      headless: !headed,
      channel: headed ? "chrome" : undefined,
      args: [
        "--ignore-gpu-blocklist",
        "--enable-webgl",
        "--enable-gpu-rasterization",
      ],
    });

    page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      colorScheme: "dark",
      deviceScaleFactor: 1,
    });

    page.on("console", (message) => {
      consoleLines.push(
        `${new Date().toISOString()} [${message.type()}] ${message.text()}`,
      );
    });
    page.on("pageerror", (error) => {
      pageErrors.push(`${new Date().toISOString()} ${error.message}`);
    });

    await page.goto(captureUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-stage-debug-root]", { timeout: 30000 });

    const captureAt = async (label, delayMs) => {
      if (delayMs > 0) {
        await page.waitForTimeout(delayMs);
      }
      const state = await page.locator("[data-stage-debug-root]").evaluate((el) => ({
        state: el.getAttribute("data-stage-debug-state"),
        mark: el.getAttribute("data-stage-debug-mark"),
        idlePlaying: el.getAttribute("data-stage-debug-idle-playing"),
        idleTracks: el.getAttribute("data-stage-debug-idle-tracks"),
        stageScale: el.getAttribute("data-stage-debug-stage-scale"),
        bodyText: document.body.innerText,
      }));
      stateSamples.push({ label, ...state });
      await capturePageState(page, `stage-debug-${label}`);
    };

    await captureAt("initial", 0);
    await captureAt("1s", 1000);
    await captureAt("5s", 4000);
    await captureAt("15s", 10000);

    await fs.writeFile(
      path.resolve(outputDir, "stage-debug-console.log"),
      `${consoleLines.join("\n")}\n${pageErrors.join("\n")}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.resolve(outputDir, "stage-debug-states.json"),
      `${JSON.stringify(stateSamples, null, 2)}\n`,
      "utf8",
    );

    console.log(`Captured stage debug artifacts in ${outputDir}`);
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
