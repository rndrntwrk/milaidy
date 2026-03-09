import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

export function ChannelsFeedsPanel() {
    return (
        <SciFiPanel variant="glass" className="flex-1 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">CHANNELS & FEEDS</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px] sm:text-xs">
                <div className="text-ok">✓ [TELEGRAM] Bot connected successfully</div>
                <div className="text-warn">⚠ [X/TWITTER] Rate limit approaching (95/100)</div>
                <div className="text-muted">  [SYSTEM] Background vector indexing complete.</div>
                <div className="text-info">ℹ [DISCORD] New message from #general.</div>
            </div>
        </SciFiPanel>
    );
}
