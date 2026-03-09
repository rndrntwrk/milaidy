import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { NeonButton } from './ui/NeonButton.js';

export function ActionDeckPanel() {
    return (
        <SciFiPanel variant="glass" className="h-48 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">ACTION DECK</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2">
                <NeonButton variant="outline" size="sm" className="w-full">DISCORD</NeonButton>
                <NeonButton variant="outline" size="sm" className="w-full">TELEGRAM</NeonButton>
                <NeonButton variant="outline" size="sm" className="w-full">TWITTER</NeonButton>
                <NeonButton variant="outline" size="sm" className="w-full">TERMINAL</NeonButton>
            </div>
        </SciFiPanel>
    );
}
