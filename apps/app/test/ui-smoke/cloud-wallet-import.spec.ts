import { expect, test } from "@playwright/test";
import {
  installCloudWalletImportApiOverrides,
  installDefaultAppMocks,
  openAppPath,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppMocks(page);
});

test("inventory Import from Eliza Cloud sends eliza-cloud RPC and hits steward-status", async ({
  page,
}) => {
  const api = await installCloudWalletImportApiOverrides(page);

  await openAppPath(page, "/inventory");

  const importBtn = page.getByRole("button", {
    name: "Import from Eliza Cloud",
  });
  await expect(importBtn).toBeVisible({ timeout: 15_000 });
  await importBtn.click();

  await expect
    .poll(() => api.lastWalletConfigPut(), { timeout: 15_000 })
    .not.toBeNull();

  const put = api.lastWalletConfigPut() as {
    selections?: Record<string, string>;
  };
  expect(put.selections).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });

  // Mount loads steward once; saving wallet RPC triggers another refresh.
  expect(api.stewardStatusRequestCount()).toBeGreaterThanOrEqual(2);
});
