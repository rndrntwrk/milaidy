import React, { useMemo } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { useApp } from '../AppContext.js';

export function CognitiveTracePanel() {
    const { conversationMessages } = useApp();

    // Get the last 5 messages to show as traces
    const traces = useMemo(() => {
        return conversationMessages.slice(-5).reverse();
    }, [conversationMessages]);

    return (
        <SciFiPanel variant="glass" className="h-64 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">COGNITIVE TRACE</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-2 text-txt flex flex-col-reverse">
                {traces.length === 0 && <div className="animate-pulse text-muted">Monitoring internal thought process...</div>}
                {traces.map((msg) => {
                    const isAssistant = msg.role === 'assistant';
                    const colorClass = isAssistant ? "border-accent bg-accent/5 text-accent" : "border-primary bg-primary/5 text-primary";
                    const label = isAssistant ? "[THOUGHT]" : "[INPUT]";
                    return (
                        <div key={msg.id} className={`p-2 border-l-2 ${colorClass}`}>
                            <span className="font-bold mr-2">{label}</span>
                            <span className="text-txt line-clamp-2">{msg.text || '...'}</span>
                        </div>
                    );
                })}
            </div>
        </SciFiPanel>
    );
}
