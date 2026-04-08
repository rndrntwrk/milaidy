import { BabylonOperatorSurface } from "./BabylonOperatorSurface";
import type { AppOperatorSurfaceComponent } from "./types";

const OPERATOR_SURFACE_COMPONENTS: Record<string, AppOperatorSurfaceComponent> =
  {
    "@elizaos/app-babylon": BabylonOperatorSurface,
  };

export function getAppOperatorSurface(
  appName: string | null | undefined,
): AppOperatorSurfaceComponent | null {
  if (!appName) return null;
  return OPERATOR_SURFACE_COMPONENTS[appName] ?? null;
}
