import { useCallback, useRef, useState } from "react";
import { useConnections } from "../../lib/ConnectionProvider";

interface ExportPanelProps {
  connectionId: string;
}

export function ExportPanel({ connectionId }: ExportPanelProps) {
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === connectionId);

  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    if (!conn || password.length < 4) return;
    setStatus("Exporting...");
    try {
      const blob = await conn.client.exportAgent(password);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `milady-agent-export-${Date.now()}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Export complete");
    } catch (err) {
      setStatus(`Export failed: ${err}`);
    }
  }, [conn, password]);

  const handleImport = useCallback(async () => {
    if (!conn || password.length < 4) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("No file selected");
      return;
    }
    setStatus("Importing...");
    try {
      await conn.client.importAgent(file, password);
      setStatus("Import complete");
    } catch (err) {
      setStatus(`Import failed: ${err}`);
    }
  }, [conn, password]);

  if (!connectionId) {
    return (
      <div className="text-text-muted font-mono text-sm text-center py-16">
        Select an agent from the Agents panel to export or import snapshots.
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="text-text-muted font-mono text-sm">
        Connection not found
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md">
      <label className="block">
        <span className="text-text-muted text-xs font-mono">
          Password (min 4 chars)
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
        />
      </label>

      <input ref={fileRef} type="file" className="hidden" />

      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={password.length < 4}
          className="px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors disabled:opacity-30"
        >
          Export Agent
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors"
        >
          Select File...
        </button>
        <button
          onClick={handleImport}
          disabled={password.length < 4}
          className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors disabled:opacity-30"
        >
          Import Agent
        </button>
      </div>

      {status && <p className="text-xs font-mono text-text-muted">{status}</p>}
    </div>
  );
}
