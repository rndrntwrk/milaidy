import React from 'react';
import { useApp } from '../AppContext.js';
import { GlowingText } from './ui/GlowingText.js';

export function ThreadsDrawer({ open, onClose }: { open: boolean, onClose: () => void }) {
    if (!open) return null;

    return (
        <div className="fixed inset-y-0 left-0 w-80 bg-surface/90 backdrop-blur-xl border-r border-accent shadow-[10px_0_30px_var(--accent-subtle)] z-40 flex flex-col transform transition-transform duration-300">
            <div className="p-4 border-b border-accent/20 flex justify-between items-center">
                <GlowingText className="text-lg tracking-widest text-accent">COMM_THREADS</GlowingText>
                <button onClick={onClose} className="text-muted hover:text-accent">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {/* Fake threads for layout mapping */}
                <div className="p-3 border border-accent bg-accent/10 rounded cursor-pointer">
                    <div className="text-txt font-bold truncate">Project JARVIS implementation</div>
                    <div className="text-xs text-muted mt-1">Active session - Just now</div>
                </div>
                <div className="p-3 border border-border hover:border-accent/50 rounded cursor-pointer opacity-70">
                    <div className="text-txt font-bold truncate">Web search integration</div>
                    <div className="text-xs text-muted mt-1">Archived - 2 hrs ago</div>
                </div>
                <div className="p-3 border border-border hover:border-accent/50 rounded cursor-pointer opacity-70">
                    <div className="text-txt font-bold truncate">Crypto wallet config</div>
                    <div className="text-xs text-muted mt-1">Archived - Yesterday</div>
                </div>
            </div>
        </div>
    );
}
