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

test("all Storybook stories render in light mode", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const response = await page.request.get("/index.json");
  expect(response.ok()).toBeTruthy();

  const storyIndex = (await response.json()) as StoryIndex;
  const stories = Object.entries(storyIndex.entries)
    .filter(([, entry]) => entry.type === "story")
    .sort(([, left], [, right]) =>
      `${left.title}:${left.name}`.localeCompare(`${right.title}:${right.name}`),
    );
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  for (const [id, entry] of stories) {
    await test.step(`${entry.title} / ${entry.name}`, async () => {
      pageErrors.length = 0;

      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:light`,
      );
      await page.waitForLoadState("networkidle");

      const root = page.locator("#storybook-root");

      await expect(root).toBeVisible();
      await expect.poll(async () =>
        root.evaluate((node) => node.childElementCount),
      ).toBeGreaterThan(0);
      expect(pageErrors).toEqual([]);
    });
  }
});
