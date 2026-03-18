import { useState } from "react";

interface ConnectionModalProps {
  onSubmit: (data: { name: string; url: string; type: "local" | "remote" | "cloud" }) => void;
  onClose: () => void;
}

export function ConnectionModal({ onSubmit, onClose }: ConnectionModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://localhost:2138");
  const [type, setType] = useState<"local" | "remote" | "cloud">("local");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-secondary border border-white/10 rounded p-6 w-96 space-y-4">
        <h3 className="font-mono text-xs uppercase tracking-widest text-brand">Add Connection</h3>

        <label className="block">
          <span className="text-text-muted text-xs font-mono">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Local Agent"
            className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-text-muted text-xs font-mono">URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:2138"
            className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-text-muted text-xs font-mono">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "local" | "remote" | "cloud")}
            className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
          >
            <option value="local">Local</option>
            <option value="remote">Remote</option>
            <option value="cloud">Cloud</option>
          </select>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => onSubmit({ name, url, type })}
            disabled={!name || !url}
            className="flex-1 px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors disabled:opacity-30"
          >
            Connect
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
