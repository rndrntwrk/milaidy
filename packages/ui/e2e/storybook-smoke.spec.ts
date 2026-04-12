import { expect, test } from "@playwright/test";

test("chat workspace story renders an interactive shell", async ({ page }) => {
  await page.goto("/?path=/story/composites-chat--workspace");
  const preview = page.frameLocator("#storybook-preview-iframe");

  await expect(preview.getByLabel("Search chats")).toBeVisible();
  await expect(preview.getByTestId("chat-composer-textarea")).toBeVisible();
  await expect(preview.getByRole("button", { name: "New chat" })).toBeVisible();
});

test("sidebar story renders search and rail controls", async ({ page }) => {
  await page.goto("/?path=/story/composites-sidebar--expanded");
  const preview = page.frameLocator("#storybook-preview-iframe");

  await expect(preview.getByLabel("Search workspaces")).toBeVisible();
  await expect(preview.getByText("Workspace")).toBeVisible();
  await expect(preview.getByText("Character")).toBeVisible();
});
