import { useCallback, useEffect, useState } from "react";
import { useConnections } from "../../lib/ConnectionProvider";
import type { AgentStatus } from "../../lib/cloud-api";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";

interface AgentEntry {
  agent: AgentStatus;
  connectionId: string;
  connectionName: string;
}

export function AgentGrid() {
  const { connections } = useConnections();
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const fetchAgents = useCallback(async () => {
    const entries: AgentEntry[] = [];
    for (const conn of connections) {
      if (conn.health !== "healthy") continue;
      try {
        const status = await conn.client.getAgentStatus();
        entries.push({
          agent: status,
          connectionId: conn.id,
          connectionName: conn.name || conn.url,
        });
      } catch {
        // Connection may not have agent status endpoint
      }
    }
    setAgents(entries);
  }, [connections]);

  // Fetch agents when connections change (ConnectionProvider handles the 5s polling).
  // No independent interval here to avoid double-polling.
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleAction = useCallback(
    async (idx: number, action: "play" | "resume" | "pause" | "stop") => {
      const entry = agents[idx];
      const conn = connections.find((c) => c.id === entry.connectionId);
      if (!conn) return;
      try {
        if (action === "play") await conn.client.playAgent();
        else if (action === "resume") await conn.client.resumeAgent();
        else if (action === "pause") await conn.client.pauseAgent();
        else if (action === "stop") await conn.client.stopAgent();
        await fetchAgents();
      } catch (err) {
        console.error(`Failed to ${action} agent:`, err);
      }
    },
    [agents, connections, fetchAgents],
  );

  if (agents.length === 0) {
    return (
      <div className="text-text-muted font-mono text-sm text-center py-16">
        No agents found. Connect to a running Milady container to see agents.
      </div>
    );
  }

  const selected = selectedIdx !== null ? agents[selectedIdx] : null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((entry, i) => (
          <AgentCard
            key={`${entry.connectionId}-${entry.agent.agentName}`}
            agent={entry.agent}
            connectionName={entry.connectionName}
            onPlay={() => handleAction(i, "play")}
            onResume={() => handleAction(i, "resume")}
            onPause={() => handleAction(i, "pause")}
            onStop={() => handleAction(i, "stop")}
            onSelect={() => setSelectedIdx(selectedIdx === i ? null : i)}
            selected={selectedIdx === i}
          />
        ))}
      </div>

      {selected && (
        <div className="mt-6">
          <AgentDetail
            agent={selected.agent}
            connectionId={selected.connectionId}
          />
        </div>
      )}
    </div>
  );
}
