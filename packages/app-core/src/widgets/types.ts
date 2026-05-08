import type { ComponentType } from "react";
import type { ChatSidebarWidgetProps } from "../components/chat/widgets/types";

export type WidgetSlot = "chat-sidebar" | "character" | (string & {});

export type WidgetProps = ChatSidebarWidgetProps;

export interface PluginWidgetDeclaration {
  id: string;
  pluginId: string;
  slot: WidgetSlot;
  label: string;
  icon?: string;
  order?: number;
  defaultEnabled?: boolean;
  uiSpec?: unknown;
}

export interface WidgetRegistration {
  pluginId: string;
  declarationId: string;
  Component: ComponentType<WidgetProps>;
}
