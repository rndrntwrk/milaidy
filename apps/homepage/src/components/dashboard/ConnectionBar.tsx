import { useState } from "react";
import { useConnections } from "../../lib/ConnectionProvider";
import { ConnectionModal } from "./ConnectionModal";

export function ConnectionBar() {
  const { connections, add, remove } = useConnections();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="px-6 py-3 border-b border-white/10 flex items-center gap-4 flex-wrap">
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1 border border-white/20 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-brand hover:text-brand transition-colors"
      >
        + Add Connection
      </button>

      {connections.map((conn) => (
        <div key={conn.id} className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              conn.health === "healthy"
                ? "bg-green-500"
                : conn.health === "unreachable"
                  ? "bg-white/20 border border-white/30"
                  : "bg-yellow-500 animate-pulse"
            }`}
          />
          <span className="text-text-muted">{conn.name || conn.url}</span>
          <button
            onClick={() => remove(conn.id)}
            className="text-white/20 hover:text-red-400 transition-colors ml-1"
          >
            ✕
          </button>
        </div>
      ))}

      {connections.length === 0 && (
        <span className="text-text-muted font-mono text-xs">No connections. Add one to get started.</span>
      )}

      {showModal && (
        <ConnectionModal
          onSubmit={(data) => {
            add(data);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
