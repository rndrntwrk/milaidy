import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

export function MemoryConsolePanel() {
    return (
        <SciFiPanel variant="glass" className="flex-1 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">MEMORY CONSOLE</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="SEARCH VECTOR DB..."
                        className="w-full bg-bg border border-accent/30 rounded p-2 text-xs font-mono text-accent placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                </div>
                <div className="mt-4 space-y-2">
                    <div className="p-2 border border-border rounded text-xs text-muted font-mono hover:bg-accent/10 cursor-pointer">
                        Vector Hash: 0x9f...a1 <br /> Score: 0.98
                    </div>
                    <div className="p-2 border border-border rounded text-xs text-muted font-mono hover:bg-accent/10 cursor-pointer">
                        Vector Hash: 0x2b...c4 <br /> Score: 0.85
                    </div>
                </div>
            </div>
        </SciFiPanel>
    );
}
