import type { ComponentType } from "react";
import type { ChatSidebarWidgetDefinition } from "../components/chat/widgets/types";
import type {
  PluginWidgetDeclaration,
  WidgetProps,
  WidgetSlot,
} from "./types";

const COMPONENT_REGISTRY = new Map<string, ComponentType<WidgetProps>>();
const BUILTIN_WIDGET_FALLBACK_PLUGIN_IDS = new Set<string>();

export const BUILTIN_WIDGET_DECLARATIONS: PluginWidgetDeclaration[] = [];

function componentKey(pluginId: string, declarationId: string): string {
  return `${pluginId}/${declarationId}`;
}

export function registerWidgetComponent(
  pluginId: string,
  declarationId: string,
  Component: ComponentType<WidgetProps>,
): void {
  COMPONENT_REGISTRY.set(componentKey(pluginId, declarationId), Component);
}

export function getWidgetComponent(
  pluginId: string,
  declarationId: string,
): ComponentType<WidgetProps> | undefined {
  return COMPONENT_REGISTRY.get(componentKey(pluginId, declarationId));
}

export function registerBuiltinWidgets(
  definitions: ReadonlyArray<ChatSidebarWidgetDefinition>,
): void {
  for (const definition of definitions) {
    registerWidgetComponent(
      definition.pluginId,
      definition.id,
      definition.Component as ComponentType<WidgetProps>,
    );
    registerBuiltinWidgetDeclarations(
      [
        {
          id: definition.id,
          pluginId: definition.pluginId,
          slot: "chat-sidebar",
          label: definition.id,
          order: definition.order,
          defaultEnabled: definition.defaultEnabled,
        },
      ],
      { fallbackPluginIds: [definition.pluginId] },
    );
  }
}

export function registerBuiltinWidgetDeclarations(
  declarations: ReadonlyArray<PluginWidgetDeclaration>,
  options?: { fallbackPluginIds?: ReadonlyArray<string> },
): void {
  for (const declaration of declarations) {
    const existing = BUILTIN_WIDGET_DECLARATIONS.findIndex(
      (entry) =>
        entry.id === declaration.id &&
        entry.pluginId === declaration.pluginId,
    );
    if (existing >= 0) {
      BUILTIN_WIDGET_DECLARATIONS[existing] = declaration;
    } else {
      BUILTIN_WIDGET_DECLARATIONS.push(declaration);
    }
  }
  for (const pluginId of options?.fallbackPluginIds ?? []) {
    BUILTIN_WIDGET_FALLBACK_PLUGIN_IDS.add(pluginId);
  }
}

export interface WidgetPluginState {
  id: string;
  enabled?: boolean;
  isActive?: boolean;
}

interface ResolvedWidget {
  declaration: PluginWidgetDeclaration;
  Component: ComponentType<WidgetProps> | null;
}

function isWidgetEnabled(
  declaration: PluginWidgetDeclaration,
  plugins: readonly WidgetPluginState[],
): boolean {
  if (plugins.length === 0) {
    return (
      declaration.defaultEnabled !== false &&
      BUILTIN_WIDGET_FALLBACK_PLUGIN_IDS.has(declaration.pluginId)
    );
  }
  const plugin = plugins.find((entry) => entry.id === declaration.pluginId);
  return plugin?.isActive === true || plugin?.enabled !== false;
}

export function resolveWidgetsForSlot(
  slot: WidgetSlot,
  plugins: readonly WidgetPluginState[] = [],
  declarations: readonly PluginWidgetDeclaration[] = BUILTIN_WIDGET_DECLARATIONS,
): ResolvedWidget[] {
  return declarations
    .filter((declaration) => declaration.slot === slot)
    .filter((declaration) => isWidgetEnabled(declaration, plugins))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((declaration) => ({
      declaration,
      Component: getWidgetComponent(declaration.pluginId, declaration.id) ?? null,
    }));
}

export function resolveChatSidebarWidgets(
  plugins: readonly WidgetPluginState[] = [],
  declarations: readonly PluginWidgetDeclaration[] = BUILTIN_WIDGET_DECLARATIONS,
): ResolvedWidget[] {
  return resolveWidgetsForSlot("chat-sidebar", plugins, declarations);
}
