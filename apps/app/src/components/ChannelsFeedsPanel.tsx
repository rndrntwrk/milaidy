import React, { useEffect } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { useApp } from '../AppContext.js';

export function ChannelsFeedsPanel() {
    const { logs, loadLogs } = useApp();

    useEffect(() => {
        void loadLogs();
        const interval = setInterval(loadLogs, 5000);
        return () => clearInterval(interval);
    }, [loadLogs]);

    return (
        <SciFiPanel variant="glass" className="flex-1 flex flex-col min-h-[16rem]">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">CHANNELS & FEEDS</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px] sm:text-xs">
                {logs.length === 0 && <div className="text-muted text-center pt-4">WAITING FOR TELEMETRY...</div>}
                {logs.slice(0, 50).map((log, i) => {
                    const isError = log.level === 'error';
                    const isWarn = log.level === 'warn';
                    const isInfo = log.level === 'info';
                    const color = isError ? 'text-danger' : (isWarn ? 'text-warn' : (isInfo ? 'text-info' : 'text-muted'));
                    const icon = isError ? '✖' : (isWarn ? '⚠' : (isInfo ? 'ℹ' : '·'));
                    return (
                        <div key={`${log.timestamp}-${i}`} className={`${color} flex gap-2 break-all`}>
                            <span className="shrink-0">{icon}</span>
                            <span className="shrink-0">[{log.source}]</span>
                            <span>{log.message}</span>
                        </div>
                    );
                })}
            </div>
        </SciFiPanel>
    );
}
