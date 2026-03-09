import React from 'react';
import { useApp } from '../AppContext.js';
import { GlowingText } from './ui/GlowingText.js';
import { NeonButton } from './ui/NeonButton.js';

export function ControlStackModal({ open, onClose }: { open: boolean, onClose: () => void }) {
    if (!open) return null;

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
                            <button className="text-left p-3 border border-border rounded hover:border-accent hover:bg-accent/10 transition-colors">
                                <div className="text-txt font-bold">Theme / Appearance</div>
                                <div className="text-xs text-muted">Holographic HUD config</div>
                            </button>
                            <button className="text-left p-3 border border-border rounded hover:border-accent hover:bg-accent/10 transition-colors">
                                <div className="text-txt font-bold">Identity Engine</div>
                                <div className="text-xs text-muted">Agent traits and Voice</div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-warn font-mono text-sm border-b border-warn/20 pb-1">ADVANCED PROTOCOLS</h3>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button className="text-left p-3 border border-border rounded hover:border-warn hover:bg-warn/10 transition-colors">
                                <div className="text-txt font-bold">Plugins & Connectors</div>
                                <div className="text-xs text-muted">Manage external integrations</div>
                            </button>
                            <button className="text-left p-3 border border-border rounded hover:border-warn hover:bg-warn/10 transition-colors">
                                <div className="text-txt font-bold">Database & Memory</div>
                                <div className="text-xs text-muted">Inspect local SQLite and Vector store</div>
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
