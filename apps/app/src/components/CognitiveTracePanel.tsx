import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

export function CognitiveTracePanel() {
    return (
        <SciFiPanel variant="glass" className="h-64 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">COGNITIVE TRACE</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-2 text-txt">
                <div className="animate-pulse text-muted">Monitoring internal thought process...</div>
                <div className="p-2 border-l-2 border-accent bg-accent/5">
                    <span className="text-info">[THOUGHT]</span> Analyzing user input intent.
                </div>
                <div className="p-2 border-l-2 border-primary bg-primary/5">
                    <span className="text-primary">[ACTION]</span> Fetching memory vectors.
                </div>
            </div>
        </SciFiPanel>
    );
}
