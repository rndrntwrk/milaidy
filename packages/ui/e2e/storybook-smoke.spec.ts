import { expect, test } from "@playwright/test";

test("chat workspace story renders an interactive shell", async ({ page }) => {
  await page.goto("/?path=/story/composites-chat--workspace");

  await expect(page.getByLabel("Search chats")).toBeVisible();
  await expect(page.getByTestId("chat-composer-textarea")).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
});

test("sidebar story renders search and rail controls", async ({ page }) => {
  await page.goto("/?path=/story/composites-sidebar--expanded");

  await expect(page.getByLabel("Search workspaces")).toBeVisible();
  await expect(page.getByText("Workspace")).toBeVisible();
  await expect(page.getByText("Character")).toBeVisible();
});
