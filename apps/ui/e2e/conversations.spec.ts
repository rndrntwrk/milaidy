import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Conversations sidebar (left panel on chat tab)", () => {
  test("shows conversations sidebar on chat tab", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");
    await expect(sidebar).toBeVisible();
  });

  test("shows New Chat button", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");
    await expect(sidebar.getByText("+ New Chat")).toBeVisible();
  });

  test("shows empty state when no conversations", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");
    await expect(sidebar.getByText("No conversations yet")).toBeVisible();
  });

  test("creating a new conversation adds it to the list", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");
    await sidebar.getByText("+ New Chat").click();

    // Should show the new conversation
    await expect(sidebar.getByText("New Chat")).toBeVisible();
    // Empty state should disappear
    await expect(sidebar.getByText("No conversations yet")).not.toBeVisible();
  });

  test("selecting a conversation highlights it", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");

    // Create a conversation
    await sidebar.getByText("+ New Chat").click();
    await expect(sidebar.locator(".conv-item")).toHaveCount(1);

    // It should have the active class (auto-selected on creation)
    await expect(sidebar.locator(".conv-item.active")).toHaveCount(1);
  });

  test("deleting a conversation removes it from the list", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");

    // Create a conversation
    await sidebar.getByText("+ New Chat").click();
    await expect(sidebar.locator(".conv-item")).toHaveCount(1);

    // Hover to reveal delete button and click it
    await sidebar.locator(".conv-item").hover();
    await sidebar.locator(".conv-delete").click();

    // Should be back to empty
    await expect(sidebar.getByText("No conversations yet")).toBeVisible();
  });

  test("sidebars are not shown on non-chat tabs", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/plugins");

    // Sidebars should not be present
    await expect(page.locator("conversations-sidebar")).not.toBeVisible();
    await expect(page.locator("widget-sidebar")).not.toBeVisible();
  });

  test("both sidebars visible together on chat tab", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await expect(page.locator("conversations-sidebar")).toBeVisible();
    await expect(page.locator("widget-sidebar")).toBeVisible();
  });

  test("sending a message auto-creates a conversation if none exists", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("conversations-sidebar");
    await expect(sidebar.getByText("No conversations yet")).toBeVisible();

    // Send a message — should auto-create a conversation
    const input = page.locator(".chat-input");
    await input.fill("Hello world");
    await page.locator("button").filter({ hasText: "Send" }).click();

    // Conversation should appear in the sidebar
    await expect(sidebar.locator(".conv-item")).toHaveCount(1, { timeout: 5000 });
  });
});
