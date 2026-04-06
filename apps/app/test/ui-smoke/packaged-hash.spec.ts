import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import {
  expectNoOnboardingRedirect,
  expectRootReady,
  installDefaultAppMocks,
  seedAppStorage,
} from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.resolve(here, "../../dist/index.html");

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page);
  await seedAppStorage(page);
});

test("dist exists and file URL hash routing loads settings", async ({
  page,
}) => {
  test.skip(
    !fs.existsSync(distIndex),
    "apps/app/dist/index.html missing — run `cd apps/app && bun run build`",
  );

  const target = `${pathToFileURL(distIndex).href}#/settings`;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await expectRootReady(page);
  await expectNoOnboardingRedirect(page);

  expect(new URL(page.url()).protocol).toBe("file:");
});
