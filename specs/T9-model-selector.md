# T9: Model Selector Overlay

## Goal
Add a Ctrl+P overlay that lets the user switch LLM models using pi-ai's model registry, rendered as a pi-tui `SelectList` overlay.

## Reference
Study `pi-mono/packages/coding-agent/src/modes/interactive/components/model-selector.ts` for how pi does this.

## pi-ai Model Registry

```typescript
import { getAvailableModels, getModel, type Model } from "@mariozechner/pi-ai";

// Get all models that have API keys configured
const models = getAvailableModels(); // Model<any>[]

// Each model has:
// model.provider   — "anthropic", "openai", "google", etc.
// model.modelId    — "claude-sonnet-4-20250514", "gpt-4o", etc.
// model.api        — "anthropic-messages", "openai-responses", etc.
```

## pi-tui Overlay System

From `pi-mono/packages/tui/src/tui.ts`:

```typescript
// Show an overlay
const handle = tui.showOverlay(component, {
  anchor: "center",
  width: "60%",
  maxHeight: "80%",
});

// Dismiss
handle.dismiss();
```

## pi-tui SelectList

From `pi-mono/packages/tui/src/components/select-list.ts`:

```typescript
const list = new SelectList<Model<any>>(items, {
  // Render each item
  renderItem: (item, selected, width) => {
    const prefix = selected ? "→ " : "  ";
    return `${prefix}${item.provider}/${item.modelId}`;
  },
  onSelect: (item) => { /* user chose this model */ },
  onCancel: () => { /* user pressed Escape */ },
});
```

## Implementation

### `src/tui/components/model-selector.ts`

```typescript
import {
  SelectList,
  type SelectItem,
  type SelectListTheme,
  type Component,
  Box,
  Text,
} from "@mariozechner/pi-tui";
import { getAvailableModels, type Model } from "@mariozechner/pi-ai";
import chalk from "chalk";

export interface ModelSelectorOptions {
  currentModel: Model<any>;
  onSelect: (model: Model<any>) => void;
  onCancel: () => void;
}

export class ModelSelectorComponent implements Component {
  private selectList: SelectList<Model<any>>;

  constructor(options: ModelSelectorOptions) {
    const models = getAvailableModels();

    // Group by provider for readability
    const items: SelectItem<Model<any>>[] = models.map((model) => ({
      value: model,
      label: `${model.provider}/${model.modelId}`,
      description: model.api,
    }));

    this.selectList = new SelectList(items, {
      renderItem: (item, selected, width) => {
        const isCurrent = item.value.provider === options.currentModel.provider
          && item.value.modelId === options.currentModel.modelId;
        const prefix = selected ? chalk.cyan("→ ") : "  ";
        const suffix = isCurrent ? chalk.dim(" (current)") : "";
        const label = selected
          ? chalk.bold(`${item.value.provider}/${item.value.modelId}`)
          : `${item.value.provider}/${chalk.dim(item.value.modelId)}`;
        return `${prefix}${label}${suffix}`;
      },
      onSelect: (item) => options.onSelect(item.value),
      onCancel: () => options.onCancel(),
    });
  }

  handleInput(data: string): void {
    this.selectList.handleInput?.(data);
  }

  render(width: number): string[] {
    const header = [
      chalk.bold(" Select Model"),
      chalk.dim(" ↑↓ navigate • Enter select • Esc cancel"),
      "",
    ];
    const listLines = this.selectList.render(width);
    return [...header, ...listLines];
  }

  invalidate(): void {
    this.selectList.invalidate();
  }
}
```

### Wiring in `tui-app.ts`

```typescript
// In global input handler:
if (matchesKey(data, "ctrl+p")) {
  this.showModelSelector();
  return;
}

private modelOverlay: OverlayHandle | null = null;

private showModelSelector(): void {
  const selector = new ModelSelectorComponent({
    currentModel: this.bridge.getCurrentModel(),
    onSelect: (model) => {
      this.bridge.switchModel(model);
      this.modelOverlay?.dismiss();
      this.modelOverlay = null;
      this.ui.setFocus(this.editor);
    },
    onCancel: () => {
      this.modelOverlay?.dismiss();
      this.modelOverlay = null;
      this.ui.setFocus(this.editor);
    },
  });

  this.modelOverlay = this.ui.showOverlay(selector, {
    anchor: "center",
    width: "60%",
    maxHeight: "70%",
  });
  this.ui.setFocus(selector);
}
```

### Bridge model switching

In `eliza-tui-bridge.ts`:

```typescript
switchModel(model: Model<any>): void {
  this.currentLargeModel = model;
  // Re-register the model handler with the new model
  registerPiAiModelHandler(this.runtime, {
    largeModel: model,
    smallModel: this.currentSmallModel,
    onStreamEvent: (event) => this.onStreamEvent(event),
  });
  this.tui.getStatusBar().update({
    modelName: model.modelId,
    modelProvider: model.provider,
  });
}
```

## Important Notes

- **`getAvailableModels()`**: Verify this function exists in pi-ai. The actual API might be different — check `pi-mono/packages/ai/src/models.ts`. It may require checking API keys first via `getEnvApiKey()`.

- **SelectList API**: The exact `SelectList` constructor differs from the simplified version above. Check `pi-mono/packages/tui/src/components/select-list.ts` for the real interface — it may use a different pattern for `items`, `renderItem`, etc.

## Acceptance
- Ctrl+P opens a centered overlay with available models
- Models are listed by provider/modelId
- Current model is marked
- Arrow keys navigate, Enter selects, Escape cancels
- Selecting a model updates the status bar and subsequent LLM calls use the new model
- Overlay dismisses properly and focus returns to editor
