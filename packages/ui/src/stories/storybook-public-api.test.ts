import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const uiSrcDir = resolve(process.cwd(), "src");
const storiesDirPath = join(uiSrcDir, "stories");

const primitiveStoryCoverage: Record<string, string[]> = {
  badge: ["Badge.stories.tsx"],
  button: ["Button.stories.tsx"],
  card: ["Card.stories.tsx"],
  checkbox: ["Checkbox.stories.tsx"],
  dialog: ["Dialog.stories.tsx"],
  "drawer-sheet": ["DrawerSheet.stories.tsx"],
  "dropdown-menu": ["DropdownMenu.stories.tsx"],
  grid: ["Grid.stories.tsx"],
  input: ["Input.stories.tsx"],
  label: ["Label.stories.tsx"],
  popover: ["Popover.stories.tsx"],
  select: ["Select.stories.tsx"],
  separator: ["Separator.stories.tsx"],
  skeleton: ["Skeleton.stories.tsx"],
  slider: ["Slider.stories.tsx"],
  sonner: ["Sonner.stories.tsx"],
  spinner: ["Spinner.stories.tsx"],
  stack: ["Stack.stories.tsx"],
  switch: ["Switch.stories.tsx"],
  tabs: ["Tabs.stories.tsx"],
  "tag-editor": ["TagEditor.stories.tsx"],
  "tag-input": ["TagInput.stories.tsx"],
  textarea: ["Textarea.stories.tsx"],
  tooltip: ["Tooltip.stories.tsx"],
  typography: ["Typography.stories.tsx"],
};

const uiStoryCoverage: Record<string, string[]> = {
  "admin-dialog": ["AdminDialog.stories.tsx"],
  banner: ["Banner.stories.tsx"],
  "confirm-delete": ["ConfirmDelete.stories.tsx"],
  "confirm-dialog": ["ConfirmDialog.stories.tsx"],
  "connection-status": ["ConnectionStatus.stories.tsx"],
  "copy-button": ["CopyButton.stories.tsx"],
  "empty-state": ["EmptyState.stories.tsx"],
  "error-boundary": ["ErrorBoundary.stories.tsx"],
  field: ["FormFields.stories.tsx"],
  "field-switch": ["FormFields.stories.tsx"],
  "form-select": ["FormFields.stories.tsx"],
  "new-action-button": ["FormFields.stories.tsx"],
  "save-footer": ["SaveFooter.stories.tsx"],
  "section-card": ["SectionCard.stories.tsx"],
  "segmented-control": ["FormFields.stories.tsx"],
  "settings-controls": ["FormFields.stories.tsx"],
  "status-badge": ["StatusBadge.stories.tsx"],
  "themed-select": ["ThemedSelect.stories.tsx"],
  "tooltip-extended": ["TooltipExtended.stories.tsx"],
};

const compositeStoryCoverage: Record<string, string[]> = {
  chat: [
    "ChatAtoms.stories.tsx",
    "ChatEmptyState.stories.tsx",
    "ChatComposites.stories.tsx",
  ],
  "page-panel": ["PagePanel.stories.tsx"],
  search: ["SearchBar.stories.tsx", "SearchInput.stories.tsx"],
  sidebar: ["Sidebar.stories.tsx"],
  skills: ["Skills.stories.tsx"],
  trajectories: ["Trajectories.stories.tsx"],
};

const layoutStoryCoverage: Record<string, string[]> = {
  "chat-panel-layout": ["ChatPanelLayout.stories.tsx"],
  "content-layout": ["ContentLayout.stories.tsx"],
  "page-layout": ["PageLayout.stories.tsx"],
  "workspace-layout": ["WorkspaceLayout.stories.tsx"],
};

function readSource(relativePath: string) {
  return readFileSync(join(uiSrcDir, relativePath), "utf8");
}

function parseExportTargets(source: string, pattern: RegExp) {
  return Array.from(source.matchAll(pattern), (match) => match[1]).sort();
}

function assertMappedStoryFiles(
  coverage: Record<string, string[]>,
  exportedTargets: string[],
) {
  for (const target of exportedTargets) {
    expect(
      coverage[target],
      `Missing Storybook coverage mapping for public export "${target}"`,
    ).toBeDefined();

    for (const storyFile of coverage[target] ?? []) {
      expect(
        existsSync(join(storiesDirPath, storyFile)),
        `Expected story file "${storyFile}" for export "${target}"`,
      ).toBe(true);
    }
  }
}

describe("Storybook public API coverage", () => {
  it("covers exported primitives", () => {
    const primitivesIndex = readSource("components/primitives/index.ts");
    const exportedPrimitives = parseExportTargets(
      primitivesIndex,
      /export \* from "\.\.\/ui\/([^"]+)";/g,
    );

    assertMappedStoryFiles(primitiveStoryCoverage, exportedPrimitives);
  });

  it("covers exported UI helpers from the shared composite index", () => {
    const compositeIndex = readSource("components/composites/index.ts");
    const exportedUiHelpers = parseExportTargets(
      compositeIndex,
      /export \* from "\.\.\/ui\/([^"]+)";/g,
    );

    assertMappedStoryFiles(uiStoryCoverage, exportedUiHelpers);
  });

  it("covers exported composite families", () => {
    const compositeIndex = readSource("components/composites/index.ts");
    const exportedFamilies = parseExportTargets(
      compositeIndex,
      /export \* from "\.\/([^"]+)";/g,
    );

    assertMappedStoryFiles(compositeStoryCoverage, exportedFamilies);
  });

  it("covers exported layouts", () => {
    const layoutsIndex = readSource("layouts/index.ts");
    const exportedLayouts = parseExportTargets(
      layoutsIndex,
      /export \* from "\.\/([^"]+)";/g,
    );

    assertMappedStoryFiles(layoutStoryCoverage, exportedLayouts);
  });
});
