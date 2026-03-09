import React, { useMemo } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { StatusIndicator } from './ui/StatusIndicator.js';
import { useApp } from '../AppContext.js';

export function RuntimeHealthPanel() {
    const { connected, agentStatus, cloudCredits, plugins } = useApp();

    const activePluginsCount = useMemo(() => plugins.filter((p) => p.enabled).length, [plugins]);

    return (
        <SciFiPanel variant="glass" className="h-64 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4 flex items-center justify-between">
                <GlowingText className="text-sm tracking-widest text-accent">RUNTIME HEALTH</GlowingText>
                <StatusIndicator status={connected ? "online" : "offline"} />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
                <div className="flex justify-between items-center bg-bg/50 p-2 rounded border border-border">
                    <span className="text-xs font-mono text-muted">PROCESS STATE</span>
                    <GlowingText className="text-xs uppercase" glowColor="var(--ok)">{agentStatus?.state || "UNKNOWN"}</GlowingText>
                </div>
                <div className="flex justify-between items-center bg-bg/50 p-2 rounded border border-border">
                    <span className="text-xs font-mono text-muted">CLOUD CREDITS</span>
                    <span className="text-xs font-mono text-accent">{cloudCredits !== null ? `$${cloudCredits.toFixed(2)}` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center bg-bg/50 p-2 rounded border border-border">
                    <span className="text-xs font-mono text-muted">ACTIVE MODEL</span>
                    <span className="text-xs font-mono text-primary truncate max-w-[120px] text-right" title={agentStatus?.model || "unknown"}>{agentStatus?.model || "unknown"}</span>
                </div>
                <div className="flex justify-between items-center bg-bg/50 p-2 rounded border border-border">
                    <span className="text-xs font-mono text-muted">PLUGINS LOADED</span>
                    <span className="text-xs font-mono text-primary">{activePluginsCount}</span>
                </div>
            </div>
        </SciFiPanel>
    );
}
