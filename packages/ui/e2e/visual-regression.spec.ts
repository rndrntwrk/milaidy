import { expect, test, type Page } from "@playwright/test";

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

type VisualStory = {
  name: string;
  snapshotName: string;
  title: string;
};

const STORIES: VisualStory[] = [
  { title: "UI/Badge", name: "Default", snapshotName: "Badge-Default" },
  { title: "UI/Badge", name: "Secondary", snapshotName: "Badge-Secondary" },
  { title: "UI/Badge", name: "Destructive", snapshotName: "Badge-Destructive" },
  { title: "UI/Badge", name: "Outline", snapshotName: "Badge-Outline" },
  { title: "UI/Banner", name: "Info", snapshotName: "Banner-Info" },
  { title: "UI/Banner", name: "Warning", snapshotName: "Banner-Warning" },
  { title: "UI/Banner", name: "Error", snapshotName: "Banner-Error" },
  { title: "UI/Button", name: "Default", snapshotName: "Button-Default" },
  {
    title: "UI/Button",
    name: "Destructive",
    snapshotName: "Button-Destructive",
  },
  { title: "UI/Button", name: "Outline", snapshotName: "Button-Outline" },
  {
    title: "UI/Button",
    name: "Secondary",
    snapshotName: "Button-Secondary",
  },
  { title: "UI/Button", name: "Ghost", snapshotName: "Button-Ghost" },
  { title: "UI/Button", name: "Link", snapshotName: "Button-Link" },
  { title: "UI/Card", name: "Default", snapshotName: "Card-Default" },
  {
    title: "UI/ChatAtoms/TypingIndicator",
    name: "Default",
    snapshotName: "TypingIndicator",
  },
  {
    title: "UI/ChatAtoms/ChatEmptyState",
    name: "Default",
    snapshotName: "ChatEmptyState",
  },
  { title: "UI/Checkbox", name: "Default", snapshotName: "Checkbox-Default" },
  {
    title: "UI/ConfirmDelete",
    name: "Default",
    snapshotName: "ConfirmDelete-Default",
  },
  {
    title: "UI/ConfirmDialog",
    name: "Danger",
    snapshotName: "ConfirmDialog-Danger",
  },
  {
    title: "UI/ConnectionStatus",
    name: "Connected",
    snapshotName: "ConnectionStatus-Connected",
  },
  {
    title: "UI/ConnectionStatus",
    name: "Disconnected",
    snapshotName: "ConnectionStatus-Disconnected",
  },
  {
    title: "UI/ConnectionStatus",
    name: "Error",
    snapshotName: "ConnectionStatus-Error",
  },
  {
    title: "UI/CopyButton",
    name: "Default",
    snapshotName: "CopyButton-Default",
  },
  { title: "UI/EmptyState", name: "Full", snapshotName: "EmptyState-Full" },
  { title: "UI/Grid", name: "Two Columns", snapshotName: "Grid-TwoColumns" },
  { title: "UI/Input", name: "Default", snapshotName: "Input-Default" },
  { title: "UI/Label", name: "Default", snapshotName: "Label-Default" },
  {
    title: "Layouts/WorkspaceLayout",
    name: "Desktop",
    snapshotName: "WorkspaceLayout-Desktop",
  },
  {
    title: "Layouts/WorkspaceLayout",
    name: "Mobile Portrait",
    snapshotName: "WorkspaceLayout-MobilePortrait",
  },
  {
    title: "Layouts/PageLayout",
    name: "Desktop",
    snapshotName: "PageLayout-Desktop",
  },
  {
    title: "Layouts/PageLayout",
    name: "Mobile Portrait",
    snapshotName: "PageLayout-MobilePortrait",
  },
  {
    title: "Layouts/ContentLayout",
    name: "Default",
    snapshotName: "ContentLayout-Default",
  },
  {
    title: "Layouts/ContentLayout",
    name: "In Modal",
    snapshotName: "ContentLayout-InModal",
  },
  {
    title: "UI/SaveFooter",
    name: "Default",
    snapshotName: "SaveFooter-Default",
  },
  {
    title: "UI/SearchBar",
    name: "Default",
    snapshotName: "SearchBar-Default",
  },
  {
    title: "UI/SearchInput",
    name: "Default",
    snapshotName: "SearchInput-Default",
  },
  {
    title: "UI/SectionCard",
    name: "Default",
    snapshotName: "SectionCard-Default",
  },
  {
    title: "UI/SectionCard",
    name: "Collapsible Expanded",
    snapshotName: "SectionCard-Collapsible",
  },
  {
    title: "UI/Separator",
    name: "Horizontal",
    snapshotName: "Separator-Horizontal",
  },
  {
    title: "UI/Skeleton",
    name: "Default",
    snapshotName: "Skeleton-Default",
  },
  { title: "UI/Skeleton", name: "Card", snapshotName: "Skeleton-Card" },
  { title: "UI/Skeleton", name: "Chat", snapshotName: "Skeleton-Chat" },
  { title: "UI/Spinner", name: "Default", snapshotName: "Spinner-Default" },
  { title: "UI/Stack", name: "Column", snapshotName: "Stack-Column" },
  { title: "UI/Stack", name: "Row", snapshotName: "Stack-Row" },
  {
    title: "UI/StatusBadge",
    name: "Success",
    snapshotName: "StatusBadge-Success",
  },
  {
    title: "UI/StatusBadge",
    name: "Warning",
    snapshotName: "StatusBadge-Warning",
  },
  {
    title: "UI/StatusBadge",
    name: "Danger",
    snapshotName: "StatusBadge-Danger",
  },
  {
    title: "UI/StatusBadge",
    name: "Stat",
    snapshotName: "StatCard-Default",
  },
  { title: "UI/Switch", name: "Default", snapshotName: "Switch-Default" },
  {
    title: "UI/TagEditor",
    name: "With Items",
    snapshotName: "TagEditor-WithItems",
  },
  {
    title: "UI/TagInput",
    name: "With Items",
    snapshotName: "TagInput-WithItems",
  },
  {
    title: "UI/Textarea",
    name: "Default",
    snapshotName: "Textarea-Default",
  },
  {
    title: "UI/ThemedSelect",
    name: "Default",
    snapshotName: "ThemedSelect-Default",
  },
  { title: "UI/Typography", name: "Default", snapshotName: "Text-Default" },
  {
    title: "UI/Typography",
    name: "Heading H 1",
    snapshotName: "Heading-H1",
  },
];

let storyIndexPromise: Promise<StoryIndex> | null = null;

async function loadStoryIndex(page: Page) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await page.request.get("/index.json");
    if (response.ok()) {
      return (await response.json()) as StoryIndex;
    }

    await page.waitForTimeout(500);
  }

  const response = await page.request.get("/index.json");
  throw new Error(`Failed to load Storybook index: ${response.status()}`);
}

async function getStoryId(
  page: Page,
  story: VisualStory,
) {
  storyIndexPromise ??= loadStoryIndex(page).catch((error) => {
    storyIndexPromise = null;
    throw error;
  });

  const index = await storyIndexPromise;
  const match = Object.entries(index.entries).find(
    ([, entry]) =>
      entry.type === "story" &&
      entry.title === story.title &&
      entry.name === story.name,
  );

  if (!match) {
    throw new Error(
      `Unable to find story "${story.title} / ${story.name}" in Storybook index.`,
    );
  }

  return match[0];
}

for (const story of STORIES) {
  test.describe(story.snapshotName, () => {
    test("light mode", async ({ page }) => {
      const id = await getStoryId(page, story);

      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:light`,
      );
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${story.snapshotName}-light.png`);
    });

    test("dark mode", async ({ page }) => {
      const id = await getStoryId(page, story);

      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:dark`,
      );
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${story.snapshotName}-dark.png`);
    });
  });
}
