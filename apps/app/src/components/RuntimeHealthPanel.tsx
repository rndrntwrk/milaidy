import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { StatusIndicator } from './ui/StatusIndicator.js';
import { useApp } from '../AppContext.js';

export function RuntimeHealthPanel() {
    const { connected, agentStatus } = useApp();

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
                    <span className="text-xs font-mono text-muted">MEMORY USAGE</span>
                    <span className="text-xs font-mono text-accent">45%</span>
                </div>
                <div className="flex justify-between items-center bg-bg/50 p-2 rounded border border-border">
                    <span className="text-xs font-mono text-muted">ACTIVE SESSIONS</span>
                    <span className="text-xs font-mono text-primary">12</span>
                </div>
            </div>
        </SciFiPanel>
    );
}
