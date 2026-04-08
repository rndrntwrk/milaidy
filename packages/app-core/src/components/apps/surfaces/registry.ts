import { BabylonOperatorSurface } from "./BabylonOperatorSurface";
import { TwoThousandFourScapeOperatorSurface } from "./TwoThousandFourScapeOperatorSurface";
import type { AppOperatorSurfaceComponent } from "./types";

const OPERATOR_SURFACE_COMPONENTS: Record<string, AppOperatorSurfaceComponent> =
  {
    "@elizaos/app-babylon": BabylonOperatorSurface,
    "@elizaos/app-2004scape": TwoThousandFourScapeOperatorSurface,
  };

export function getAppOperatorSurface(
  appName: string | null | undefined,
): AppOperatorSurfaceComponent | null {
  if (!appName) return null;
  return OPERATOR_SURFACE_COMPONENTS[appName] ?? null;
}
