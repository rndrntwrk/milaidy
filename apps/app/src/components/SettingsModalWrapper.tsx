import React from 'react';
import { SettingsView } from './SettingsView.js';
import { useApp } from '../AppContext.js';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

export function SettingsModalWrapper() {
    const { tab, setTab } = useApp();
    if (tab !== 'settings') return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/90 backdrop-blur-sm font-body text-txt">
            {/* Background click overlay */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setTab('chat')} />

            <SciFiPanel className="relative w-full max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-[0_0_50px_var(--accent-subtle)] bg-card border-[var(--accent)] z-10" glowColor="var(--accent)">
                <div className="p-4 border-b border-accent/30 flex justify-between items-center bg-accent/5 shrink-0 relative z-20">
                    <GlowingText className="text-xl tracking-widest text-accent font-bold uppercase">SYSTEM PREFERENCES</GlowingText>
                    <button onClick={() => setTab('chat')} className="text-muted hover:text-accent transition-colors p-1" aria-label="Close settings">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto relative z-10 bg-bg">
                    <div className="p-6">
                        <SettingsView />
                    </div>
                </div>
            </SciFiPanel>
        </div>
    );
}
