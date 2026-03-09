import React from 'react';
import { useApp } from '../AppContext.js';
import { GlowingText } from './ui/GlowingText.js';
import { NeonButton } from './ui/NeonButton.js';

export function ControlStackModal({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { setTab } = useApp();
    if (!open) return null;

    const handleOpen = (tab: any) => {
        onClose(); // Close the menu stack
        setTab(tab); // Trigger the wrapper modal
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl bg-card border-2 border-accent rounded-lg shadow-[0_0_50px_var(--accent-subtle)] overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-accent/30 flex justify-between items-center bg-accent/5">
                    <GlowingText className="text-xl tracking-widest text-accent font-bold">CONTROL STACK</GlowingText>
                    <button onClick={onClose} className="text-muted hover:text-accent transition-colors">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-accent font-mono text-sm border-b border-accent/20 pb-1">ROOT PREFERENCES</h3>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button onClick={() => handleOpen('settings')} className="text-left p-3 border border-[var(--border)] rounded hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors text-[var(--txt)] hover:text-[var(--accent)] cursor-pointer">
                                <div className="font-bold">Theme / Appearance</div>
                                <div className="text-xs opacity-70">Holographic HUD config</div>
                            </button>
                            <button onClick={() => handleOpen('identity')} className="text-left p-3 border border-[var(--border)] rounded hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors text-[var(--txt)] hover:text-[var(--accent)] cursor-pointer">
                                <div className="font-bold">Identity Engine</div>
                                <div className="text-xs opacity-70">Agent traits and Voice</div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-[var(--warn)] font-mono text-sm border-b border-[var(--warn)]/20 pb-1">ADVANCED PROTOCOLS</h3>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button onClick={() => handleOpen('plugins')} className="text-left p-3 border border-[var(--border)] rounded hover:border-[var(--warn)] hover:bg-[var(--warn)]/10 transition-colors text-[var(--txt)] hover:text-[var(--warn)] cursor-pointer">
                                <div className="font-bold">Plugins & Connectors</div>
                                <div className="text-xs opacity-70">Manage external integrations</div>
                            </button>
                            <button onClick={() => handleOpen('database')} className="text-left p-3 border border-[var(--border)] rounded hover:border-[var(--warn)] hover:bg-[var(--warn)]/10 transition-colors text-[var(--txt)] hover:text-[var(--warn)] cursor-pointer">
                                <div className="font-bold">Database & Memory</div>
                                <div className="text-xs opacity-70">Inspect local SQLite and Vector store</div>
                            </button>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-accent/30 bg-bg flex justify-end">
                    <NeonButton variant="outline" onClick={onClose}>CLOSE PROTOCOL</NeonButton>
                </div>
            </div>
        </div>
    );
}
