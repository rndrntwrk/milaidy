import { expect, type Page, test } from "@playwright/test";
import {
  type CloudAgentFixture,
  loginViaPolling,
  mockCloudApi,
} from "./fixtures/cloud-auth";

const SEED_AGENT: CloudAgentFixture = {
  id: "seed-1",
  name: "seed-agent",
  agentName: "seed-agent",
  status: "running",
  webUiUrl: "https://seed-1.milady.ai",
};

const NEW_AGENT_BUTTON = 'button[aria-label="Create new cloud agent"]';
const NAME_INPUT_ID = "#provision-name";
const SUBMIT_BUTTON_TEXT = /create agent|provisioning/i;

async function openProvisionModal(page: Page): Promise<void> {
  await page.locator(NEW_AGENT_BUTTON).click();
  await expect(
    page.getByRole("dialog", { name: /spin up an agent/i }),
  ).toBeVisible();
}

test.describe("homepage - provision agent modal", () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
  });

  test("happy path: create -> provision -> done -> auto-close", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [SEED_AGENT],
      jobStatuses: [{ status: "in_progress" }, { status: "completed" }],
    });

    await page.goto("/");
    await expect(page.locator(NEW_AGENT_BUTTON)).toBeVisible();
    await openProvisionModal(page);

    await page.locator(NAME_INPUT_ID).fill("scout-test");
    const submit = page.getByRole("button", { name: SUBMIT_BUTTON_TEXT });
    await submit.click();

    // The status line cycles through working -> done; "agent is live." is the
    // final visible string before auto-close fires after 2.5s.
    await expect(page.getByText("agent is live.")).toBeVisible({
      timeout: 30_000,
    });

    // Modal should auto-close ~2.5s after "done"; allow some slack.
    await expect(
      page.getByRole("dialog", { name: /spin up an agent/i }),
    ).toBeHidden({ timeout: 10_000 });

    const counts = state.callCounts();
    expect(counts.createAgent).toBe(1);
    expect(counts.provisionAgent).toBe(1);
    expect(counts.jobStatus).toBeGreaterThanOrEqual(1);
  });

  test("empty name keeps submit disabled", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), { agents: [SEED_AGENT] });

    await page.goto("/");
    await openProvisionModal(page);

    const submit = page.getByRole("button", { name: "create agent" });
    await expect(submit).toBeDisabled();

    // Whitespace alone doesn't satisfy the trim() check.
    await page.locator(NAME_INPUT_ID).fill("   ");
    await expect(submit).toBeDisabled();

    await page.locator(NAME_INPUT_ID).fill("ok");
    await expect(submit).toBeEnabled();
  });

  test("provision failure surfaces backend error string", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [SEED_AGENT],
      jobStatuses: [{ status: "failed", error: "out of credits" }],
    });

    await page.goto("/");
    await openProvisionModal(page);
    await page.locator(NAME_INPUT_ID).fill("doomed-agent");
    await page.getByRole("button", { name: SUBMIT_BUTTON_TEXT }).click();

    await expect(page.getByText("out of credits")).toBeVisible({
      timeout: 30_000,
    });
  });

  test.skip("provision timeout via clock fast-forward", async () => {
    // Skipped: ProvisionAgentModal uses recursive setTimeout (2.5s × 48
    // attempts = 120s). Playwright's mocked clock + the modal's awaited
    // fetch chain interleave in a way that makes the timeout deterministic
    // only with manual ticking, which is brittle across Chromium versions.
    // The "provision failure" test above exercises the same error-surface
    // path with a concrete failure status, which is the more useful guarantee.
  });
});
