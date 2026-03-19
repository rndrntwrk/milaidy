import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type CloudAgent, getToken } from "./auth";
import { CLOUD_BASE, CloudClient } from "./cloud-api";

export type AgentSource = "cloud";

export interface ManagedAgent {
  id: string;
  name: string;
  source: AgentSource;
  status: "running" | "paused" | "stopped" | "provisioning" | "unknown";
  model?: string;
  uptime?: number;
  memories?: number;
  sourceUrl?: string;
  cloudAgent?: CloudAgent;
  cloudClient?: CloudClient;
  cloudAgentId?: string;
}

interface AgentContextValue {
  agents: ManagedAgent[];
  loading: boolean;
  cloudClient: CloudClient | null;
  refresh: () => Promise<void>;
  createAgent: (config: {
    name: string;
    characterId?: string;
    config?: object;
    environmentVars?: Record<string, string>;
  }) => Promise<{ id: string } | null>;
  deleteAgent: (agentId: string) => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudClient, setCloudClient] = useState<CloudClient | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const tokenRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    const results: ManagedAgent[] = [];
    const token = getToken();

    if (token) {
      let cc = cloudClient;
      if (token !== tokenRef.current) {
        cc = new CloudClient(token);
        tokenRef.current = token;
        setCloudClient(cc);
      }
      if (cc) {
        try {
          const cloudAgents = await cc.listAgents();
          for (const ca of cloudAgents) {
            results.push({
              id: `cloud-${ca.id}`,
              name: ca.agentName || ca.name || ca.id,
              source: "cloud",
              status: mapCloudStatus(ca.status),
              model: ca.model,
              cloudAgent: ca,
              cloudClient: cc,
              cloudAgentId: ca.id,
              sourceUrl: `${CLOUD_BASE}/api/v1/milady/agents/${ca.id}`,
            });
          }
        } catch (err) {
          console.warn("[AgentProvider] Cloud agent fetch failed:", err);
        }
      }
    } else {
      tokenRef.current = null;
      setCloudClient(null);
    }

    setAgents(results);
    setLoading(false);
  }, [cloudClient]);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  const createAgent = useCallback(
    async (config: {
      name: string;
      characterId?: string;
      config?: object;
      environmentVars?: Record<string, string>;
    }) => {
      const cc = cloudClient;
      if (!cc) return null;
      try {
        const result = await cc.createAgent(config);
        await fetchAll();
        return result;
      } catch (err) {
        console.error("[AgentProvider] Create agent failed:", err);
        throw err;
      }
    },
    [cloudClient, fetchAll],
  );

  const deleteAgent = useCallback(
    async (agentId: string) => {
      const cc = cloudClient;
      if (!cc) return;
      try {
        await cc.deleteAgent(agentId);
        await fetchAll();
      } catch (err) {
        console.error("[AgentProvider] Delete agent failed:", err);
        throw err;
      }
    },
    [cloudClient, fetchAll],
  );

  return (
    <AgentContext
      value={{
        agents,
        loading,
        cloudClient,
        refresh: fetchAll,
        createAgent,
        deleteAgent,
      }}
    >
      {children}
    </AgentContext>
  );
}

function mapCloudStatus(status: string): ManagedAgent["status"] {
  const s = status?.toLowerCase() ?? "";
  if (s === "running" || s === "active" || s === "healthy") return "running";
  if (s === "paused" || s === "suspended") return "paused";
  if (
    s === "stopped" ||
    s === "terminated" ||
    s === "deleted" ||
    s === "disconnected" ||
    s === "error"
  )
    return "stopped";
  if (
    s === "provisioning" ||
    s === "creating" ||
    s === "starting" ||
    s === "pending"
  )
    return "provisioning";
  return "unknown";
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used within AgentProvider");
  return ctx;
}
