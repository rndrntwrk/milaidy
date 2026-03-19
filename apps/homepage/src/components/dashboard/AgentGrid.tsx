import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAgents } from "../../lib/AgentProvider";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";

interface AgentGridProps {
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
}

export function AgentGrid({ selectedAgentId, onSelectAgent }: AgentGridProps) {
  const { agents, loading, refresh, deleteAgent } = useAgents();
  const navigate = useNavigate();

  const handleAction = useCallback(
    async (agentId: string, action: "play" | "resume" | "pause" | "stop") => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent || !agent.cloudClient || !agent.cloudAgentId) return;
      try {
        if (action === "play" || action === "resume") {
          await agent.cloudClient.resumeAgent(agent.cloudAgentId);
        } else if (action === "pause" || action === "stop") {
          await agent.cloudClient.suspendAgent(agent.cloudAgentId);
        }
        await refresh();
      } catch (err) {
        console.error(`Failed to ${action} agent:`, err);
      }
    },
    [agents, refresh],
  );

  const handleDelete = useCallback(
    async (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent?.cloudAgentId) return;
      if (
        !window.confirm(`Delete agent "${agent.name}"? This cannot be undone.`)
      )
        return;
      try {
        await deleteAgent(agent.cloudAgentId);
        if (selectedAgentId === agentId) onSelectAgent(null);
      } catch (err) {
        console.error("Failed to delete agent:", err);
      }
    },
    [agents, deleteAgent, selectedAgentId, onSelectAgent],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">
          Discovering agents...
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="text-text-muted/30 text-4xl">{"\u25C9"}</div>
        <div className="text-text-muted font-mono text-sm">No agents yet</div>
        <div className="text-text-muted/50 font-mono text-xs text-center max-w-md">
          Create your first Milady agent to get started. Your agent will run in
          the cloud powered by Eliza Cloud.
        </div>
        <button
          type="button"
          onClick={() => navigate("/onboard")}
          className="mt-2 px-6 py-2.5 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
        >
          Create Agent
        </button>
      </div>
    );
  }

  const selected = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted">
          Your Agents
        </h2>
        <button
          type="button"
          onClick={() => navigate("/onboard")}
          className="px-4 py-1.5 bg-brand text-dark font-mono text-[10px] uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
        >
          + New Agent
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={{
              agentName: agent.name,
              state: agent.status,
              model: agent.model ?? "\u2014",
              uptime: agent.uptime,
              memories: agent.memories,
            }}
            connectionName={agent.source}
            onPlay={() => handleAction(agent.id, "play")}
            onResume={() => handleAction(agent.id, "resume")}
            onPause={() => handleAction(agent.id, "pause")}
            onStop={() => handleAction(agent.id, "stop")}
            onDelete={() => handleDelete(agent.id)}
            onSelect={() =>
              onSelectAgent(selectedAgentId === agent.id ? null : agent.id)
            }
            selected={selectedAgentId === agent.id}
          />
        ))}
      </div>

      {selected && (
        <div className="mt-6">
          <AgentDetail
            agent={{
              agentName: selected.name,
              state: selected.status,
              model: selected.model ?? "\u2014",
              uptime: selected.uptime,
              memories: selected.memories,
            }}
            connectionId={selected.id}
          />
        </div>
      )}
    </div>
  );
}
