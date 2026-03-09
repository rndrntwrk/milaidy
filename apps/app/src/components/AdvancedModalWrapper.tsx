import React from 'react';
import { AdvancedPageView } from './AdvancedPageView.js';
import { useApp } from '../AppContext.js';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';

const ADVANCED_TABS = [
    "plugins", "skills", "actions", "triggers", "identity",
    "approvals", "safe-mode", "governance", "fine-tuning",
    "trajectories", "runtime", "database", "logs", "security"
];

export function AdvancedModalWrapper() {
    const { tab, setTab } = useApp();
    if (!ADVANCED_TABS.includes(tab)) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 lg:p-4 bg-bg/90 backdrop-blur-sm font-body text-txt">
            {/* Background click overlay */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setTab('chat')} />

            <SciFiPanel className="relative w-full max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden shadow-[0_0_50px_var(--warning)] bg-card border-[var(--warning)] z-10 pointer-events-auto" glowColor="var(--warning)">
                <div className="p-3 lg:p-4 border-b border-warning/30 flex justify-between items-center bg-[var(--warning)]/5 shrink-0 relative z-20">
                    <GlowingText glowColor="var(--warning)" className="text-xl tracking-widest text-[var(--warning)] font-bold uppercase">ADVANCED PROTOCOLS: {tab}</GlowingText>
                    <button onClick={() => setTab('chat')} className="text-[var(--muted)] hover:text-[var(--warning)] transition-colors p-1" aria-label="Close protocols">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
                {/* AdvancedPageView manages its own sub-navigation and scrolling */}
                <div className="flex flex-col flex-1 min-h-0 relative z-10 bg-bg">
                    <AdvancedPageView />
                </div>
            </SciFiPanel>
        </div>
    );
}
