# T11: Theme Integration

## Goal
Map milaidy's visual identity to pi-tui's theme system so colors, markdown rendering, and editor styling are consistent.

## Context

### Existing milaidy palette
From `src/terminal/palette.ts` and `src/terminal/theme.ts` — milaidy already has color definitions. We adapt these for pi-tui.

### pi-tui theme system
pi-tui components accept theme objects:

```typescript
// Markdown theme
interface MarkdownTheme {
  code?: { fg?: string; bg?: string };
  codeBlock?: { fg?: string; bg?: string; border?: string };
  heading?: { fg?: string };
  bold?: { fg?: string };
  italic?: { fg?: string };
  link?: { fg?: string };
  blockquote?: { fg?: string };
  // etc.
}

// Editor theme
interface EditorTheme {
  text?: string;        // Default text color
  cursor?: string;      // Cursor color
  selection?: string;   // Selection background
  placeholder?: string; // Placeholder text color
  lineNumbers?: string; // Line number color
}

// SelectList theme
interface SelectListTheme {
  selected?: string;    // Selected item highlight
  cursor?: string;      // Cursor/arrow color
  description?: string; // Description text color
}
```

## Implementation

### `src/tui/theme.ts`

```typescript
import chalk from "chalk";
import type { MarkdownTheme, EditorTheme, SelectListTheme } from "@mariozechner/pi-tui";

// Milaidy brand colors
const ACCENT = "#E879F9";     // Fuchsia/pink — the ✨ vibe
const ACCENT_DIM = "#A855F7"; // Purple
const MUTED = "#6B7280";      // Gray-500
const SUCCESS = "#34D399";    // Emerald
const ERROR = "#F87171";      // Red-400
const WARNING = "#FBBF24";    // Amber
const INFO = "#60A5FA";       // Blue-400
const BG_SUBTLE = "#1E1E2E";  // Dark surface

export const milaidyMarkdownTheme: MarkdownTheme = {
  heading: { fg: ACCENT },
  bold: { fg: "#F9FAFB" },    // Near-white for emphasis
  italic: { fg: ACCENT_DIM },
  code: { fg: INFO },
  codeBlock: {
    fg: "#D1D5DB",            // Gray-300
    border: MUTED,
  },
  link: { fg: INFO },
  blockquote: { fg: MUTED },
};

export const milaidyEditorTheme: EditorTheme = {
  text: "#E5E7EB",            // Gray-200
  cursor: ACCENT,
  selection: ACCENT_DIM,
  placeholder: MUTED,
};

export const milaidySelectListTheme: SelectListTheme = {
  selected: ACCENT,
  cursor: ACCENT,
  description: MUTED,
};

// Helper functions matching the existing milaidy theme API
export const tuiTheme = {
  accent: (text: string) => chalk.hex(ACCENT)(text),
  muted: (text: string) => chalk.hex(MUTED)(text),
  success: (text: string) => chalk.hex(SUCCESS)(text),
  error: (text: string) => chalk.hex(ERROR)(text),
  warning: (text: string) => chalk.hex(WARNING)(text),
  info: (text: string) => chalk.hex(INFO)(text),

  // Component themes
  markdown: milaidyMarkdownTheme,
  editor: milaidyEditorTheme,
  selectList: milaidySelectListTheme,
};
```

### Apply themes to components

In `tui-app.ts`:
```typescript
import { milaidyEditorTheme, milaidyMarkdownTheme } from "./theme.js";

// Editor:
this.editor = new Editor(terminal, {
  ...editorOptions,
  theme: milaidyEditorTheme,
});

// Markdown in assistant messages:
new AssistantMessageComponent(showThinking, milaidyMarkdownTheme);
```

In `model-selector.ts`:
```typescript
import { milaidySelectListTheme } from "../theme.js";

// SelectList:
new SelectList(items, {
  theme: milaidySelectListTheme,
  ...otherOptions,
});
```

### Verify theme interfaces

**IMPORTANT**: The exact theme interfaces above are approximated from reading pi-tui source. Before implementing:

1. Check `pi-mono/packages/tui/src/components/markdown.ts` for `MarkdownTheme`
2. Check `pi-mono/packages/tui/src/components/editor.ts` for `EditorTheme`  
3. Check `pi-mono/packages/tui/src/components/select-list.ts` for `SelectListTheme`
4. Verify what properties are actually supported

The exported types from `pi-mono/packages/tui/src/index.ts` include:
```typescript
export { type DefaultTextStyle, Markdown, type MarkdownTheme } from "./components/markdown.js";
export { Editor, type EditorOptions, type EditorTheme } from "./components/editor.js";
export { type SelectItem, SelectList, type SelectListTheme } from "./components/select-list.js";
```

## Acceptance
- All TUI components use consistent milaidy-branded colors
- Markdown renders with the milaidy theme (headings in fuchsia, code in blue, etc.)
- Editor placeholder and cursor use theme colors
- Model selector uses theme colors
- Theme works on both dark and light terminals (test with `COLORFGBG`)
- No raw ANSI escapes in component code — all colors go through theme
