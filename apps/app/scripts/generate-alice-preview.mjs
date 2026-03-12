import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const outputPath = path.resolve(appRoot, "public/vrms/previews/alice.png");
const captureUrlPath = "avatar-preview.html";
const previewPort = Number(process.env.ALICE_PREVIEW_PORT) || 2142;

async function ensureOutputDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  let server;
  let browser;
  let page;
  const debugScreenshotPath = path.resolve(
    appRoot,
    "output/playwright/alice-preview-debug.png",
  );
  const successScreenshotPath = path.resolve(
    appRoot,
    "output/playwright/alice-preview-success.png",
  );

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
    const captureUrl = new URL(captureUrlPath, baseUrl).toString();

    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-angle=swiftshader",
        "--use-gl=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
      ],
    });

    page = await browser.newPage({
      viewport: { width: 800, height: 800 },
      colorScheme: "dark",
      deviceScaleFactor: 1,
    });

    const pageErrors = [];
    const consoleLogs = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("console", (message) => {
      consoleLogs.push(`${message.type()}: ${message.text()}`);
    });

    await page.goto(captureUrl, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector('[data-avatar-preview-state="ready"]', {
        timeout: 90000,
      });
    } catch (error) {
      await fs.mkdir(path.dirname(debugScreenshotPath), { recursive: true });
      await page.screenshot({
        path: debugScreenshotPath,
        fullPage: true,
      });
      const currentState = await page
        .locator("[data-avatar-preview-state]")
        .getAttribute("data-avatar-preview-state")
        .catch(() => null);
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `Current preview state: ${currentState ?? "unknown"}`,
          `Debug screenshot: ${debugScreenshotPath}`,
          consoleLogs.length > 0 ? `Console:\n${consoleLogs.join("\n")}` : "",
          pageErrors.length > 0 ? `Page errors:\n${pageErrors.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    await page.waitForTimeout(250);

    if (pageErrors.length > 0) {
      throw new Error(pageErrors.join("\n"));
    }

    await ensureOutputDirectory(outputPath);
    await fs.mkdir(path.dirname(successScreenshotPath), { recursive: true });
    await page.screenshot({
      path: successScreenshotPath,
      fullPage: true,
    });
    const frameBox = await page
      .locator("[data-avatar-preview-frame]")
      .boundingBox();
    if (!frameBox) {
      throw new Error("Alice preview frame could not be measured");
    }
    await sharp(successScreenshotPath)
      .extract({
        left: Math.round(frameBox.x),
        top: Math.round(frameBox.y),
        width: Math.round(frameBox.width),
        height: Math.round(frameBox.height),
      })
      .png()
      .toFile(outputPath);

    const file = await fs.stat(outputPath);
    if (file.size <= 0) {
      throw new Error("Alice preview generation produced an empty PNG");
    }

    // eslint-disable-next-line no-console
    console.log(`Generated Alice preview: ${outputPath}`);
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
