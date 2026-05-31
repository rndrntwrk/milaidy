import { useApp } from "@miladyai/app-core/state";
import { useLifeOpsActivitySignals } from "@elizaos/app-lifeops/hooks/useLifeOpsActivitySignals";

export function LifeOpsActivitySignalsEffect(): null {
  const { startupCoordinator, agentStatus, backendConnection } = useApp();
  const enabled =
    startupCoordinator.phase === "ready" &&
    agentStatus?.state === "running" &&
    backendConnection?.state === "connected";

  useLifeOpsActivitySignals(enabled);
  return null;
}
