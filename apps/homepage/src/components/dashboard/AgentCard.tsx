import type { AgentStatus } from "../../lib/cloud-api";

interface AgentCardProps {
  agent: AgentStatus;
  connectionName: string;
  onPlay: () => void;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
  onSelect: () => void;
  selected: boolean;
}

const STATE_COLORS = {
  running: "bg-green-500",
  paused: "bg-yellow-500",
  stopped: "bg-red-500",
} as const;

function formatUptime(seconds?: number): string {
  if (!seconds) return "\u2014";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AgentCard({
  agent,
  connectionName,
  onPlay,
  onResume,
  onPause,
  onStop,
  onSelect,
  selected,
}: AgentCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`border rounded p-4 cursor-pointer transition-all duration-200 ${
        selected
          ? "border-brand bg-brand/5"
          : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-text-light">
            {agent.agentName}
          </h3>
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {agent.model}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${STATE_COLORS[agent.state]}`}
          />
          <span className="text-[10px] font-mono text-text-muted uppercase">
            {agent.state}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted mb-3">
        <span>{"\u2191"} {formatUptime(agent.uptime)}</span>
        {agent.memories !== undefined && (
          <span>{"\u29eb"} {agent.memories} memories</span>
        )}
        <span className="ml-auto opacity-50">{connectionName}</span>
      </div>

      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {agent.state === "stopped" && (
          <button
            onClick={onPlay}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-green-500/30 text-green-500 rounded hover:bg-green-500/10 transition-colors"
          >
            Play
          </button>
        )}
        {agent.state === "paused" && (
          <button
            onClick={onResume}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-green-500/30 text-green-500 rounded hover:bg-green-500/10 transition-colors"
          >
            Resume
          </button>
        )}
        {agent.state === "running" && (
          <button
            onClick={onPause}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-yellow-500/30 text-yellow-500 rounded hover:bg-yellow-500/10 transition-colors"
          >
            Pause
          </button>
        )}
        {agent.state !== "stopped" && (
          <button
            onClick={onStop}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-red-500/30 text-red-500 rounded hover:bg-red-500/10 transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
