import type { ComponentType } from "react";

export interface AppOperatorSurfaceProps {
  appName: string;
  variant?: "detail" | "live";
}

export type AppOperatorSurfaceComponent =
  ComponentType<AppOperatorSurfaceProps>;
