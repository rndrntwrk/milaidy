import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Chat page", () => {
  test("shows chat interface when agent is running", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.locator(".chat-input")).toBeVisible();
  });

  test("shows Start button when agent is not running", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");
    await expect(page.locator("button").filter({ hasText: "Start Agent" })).toBeVisible();
  });

  test("shows empty state when no messages", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByText("Send a message to start chatting")).toBeVisible();
  });

  test("can type a message in the input", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    const input = page.locator(".chat-input");
    await input.fill("Hello agent");
    await expect(input).toHaveValue("Hello agent");
  });

  test("send button is visible", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.locator("button").filter({ hasText: "Send" })).toBeVisible();
  });

  test("sending a message shows it in the chat", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const input = page.locator(".chat-input");
    await input.fill("Hello!");
    await page.locator("button").filter({ hasText: "Send" }).click();

    await expect(page.locator(".chat-msg.user").filter({ hasText: "Hello!" })).toBeVisible({ timeout: 5000 });
  });

  test("agent name shows in header", async ({ page }) => {
    await mockApi(page, { agentName: "TestBot" });
    await page.goto("/chat");
    await expect(page.locator(".logo")).toHaveText("TestBot");
  });

  test("status pill shows running state", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.locator(".status-pill")).toHaveText("running");
  });

  test("input clears after sending a message", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const input = page.locator(".chat-input");
    await input.fill("Hi there");
    await page.locator("button").filter({ hasText: "Send" }).click();

    await expect(input).toHaveValue("");
  });

  test("user message shows 'You' as the role label", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const input = page.locator(".chat-input");
    await input.fill("Role test");
    await page.locator("button").filter({ hasText: "Send" }).click();

    await expect(page.locator(".chat-msg.user .role").first()).toHaveText("You", { timeout: 5000 });
  });

  test("agent response appears in the chat", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const input = page.locator(".chat-input");
    await input.fill("Hello agent!");
    await page.locator("button").filter({ hasText: "Send" }).click();

    // The mock sends back the agent response automatically
    await expect(page.locator(".chat-msg.assistant")).toBeVisible({ timeout: 5000 });
  });

  test("pressing Enter sends a message", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const input = page.locator(".chat-input");
    await input.fill("Enter key test");
    await input.press("Enter");

    await expect(page.locator(".chat-msg.user").filter({ hasText: "Enter key test" })).toBeVisible({ timeout: 5000 });
  });

  test("empty input does not send a message", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await page.locator("button").filter({ hasText: "Send" }).click();
    await expect(page.getByText("Send a message to start chatting")).toBeVisible();
  });

  test("empty state disappears after first message", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await expect(page.getByText("Send a message to start chatting")).toBeVisible();

    const input = page.locator(".chat-input");
    await input.fill("Goodbye empty state");
    await page.locator("button").filter({ hasText: "Send" }).click();

    await expect(page.getByText("Send a message to start chatting")).not.toBeVisible({ timeout: 5000 });
  });

  test("clicking Start Agent on stopped state sends start request and shows chat", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    await page.locator("button").filter({ hasText: "Start Agent" }).click();
    await expect(page.locator(".chat-input")).toBeVisible();
  });

  test("three-column layout: left sidebar, chat, right sidebar", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    // All three panels should be visible
    await expect(page.locator("conversations-sidebar")).toBeVisible();
    await expect(page.locator(".chat-container")).toBeVisible();
    await expect(page.locator("widget-sidebar")).toBeVisible();
  });
});
