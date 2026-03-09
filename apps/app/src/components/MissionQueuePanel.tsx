import React from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

export function MissionQueuePanel() {
    return (
        <SciFiPanel variant="glass" className="h-64 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">MISSION QUEUE</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
                <div className="bg-bg/50 border border-accent/30 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-accent/10">
                    <div className="flex flex-col">
                        <span className="text-xs font-mono font-bold text-txt">DAILY_TWEET_SCHEDULE</span>
                        <span className="text-[10px] uppercase text-muted">Recurring Task</span>
                    </div>
                    <span className="text-[10px] text-ok px-2 py-1 bg-ok/10 rounded">ACTIVE</span>
                </div>
                <div className="bg-bg/50 border border-border p-2 rounded flex justify-between items-center w-full opacity-50">
                    <div className="flex flex-col">
                        <span className="text-xs font-mono font-bold text-txt">WEB_SEARCH_QUERY</span>
                        <span className="text-[10px] uppercase text-muted">One-off</span>
                    </div>
                    <span className="text-[10px] text-muted px-2 py-1 bg-muted/10 rounded">DONE</span>
                </div>
            </div>
        </SciFiPanel>
    );
}
