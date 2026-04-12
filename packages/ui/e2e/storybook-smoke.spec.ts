import { expect, test } from "@playwright/test";

type StoryIndex = {
  entries: Record<
    string,
    {
      name: string;
      title: string;
      type: string;
    }
  >;
};

const STORYBOOK_STARTUP_ERROR_PATTERNS = [
  "Error fetching `/index.json`",
  "Unable to index ./src/stories/",
] as const;

function isIgnorableStartupError(message: string) {
  return STORYBOOK_STARTUP_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

test("all Storybook stories render in light mode", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  let response = await page.request.get("/index.json");
  for (let attempt = 0; !response.ok() && attempt < 10; attempt += 1) {
    await page.waitForTimeout(500);
    response = await page.request.get("/index.json");
  }
  expect(response.ok()).toBeTruthy();

  const storyIndex = (await response.json()) as StoryIndex;
  const stories = Object.entries(storyIndex.entries)
    .filter(([, entry]) => entry.type === "story")
    .sort(([, left], [, right]) =>
      `${left.title}:${left.name}`.localeCompare(`${right.title}:${right.name}`),
    );
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    if (isIgnorableStartupError(error.message)) {
      return;
    }
    pageErrors.push(error.message);
  });

  for (const [id, entry] of stories) {
    await test.step(`${entry.title} / ${entry.name}`, async () => {
      pageErrors.length = 0;

      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:light`,
      );
      await page.waitForLoadState("networkidle");
      await expect(page.locator("#storybook-no-preview")).toHaveCount(0);
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const root = document.querySelector("#storybook-root");
            const docs = document.querySelector("#storybook-docs");
            const portalChildren = Array.from(document.body.children).filter(
              (element) =>
                !["SCRIPT", "STYLE"].includes(element.tagName) &&
                element.id !== "storybook-root" &&
                element.id !== "storybook-docs",
            ).length;

            return Math.max(
              root?.childElementCount ?? 0,
              docs?.childElementCount ?? 0,
              portalChildren,
            );
          }),
        )
        .toBeGreaterThan(0);
      expect(pageErrors).toEqual([]);
    });
  }
});
