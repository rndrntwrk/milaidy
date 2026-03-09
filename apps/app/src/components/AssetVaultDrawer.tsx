import React from 'react';
import { useApp } from '../AppContext.js';
import { GlowingText } from './ui/GlowingText.js';

export function AssetVaultDrawer({ open, onClose }: { open: boolean, onClose: () => void }) {
    if (!open) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-surface/90 backdrop-blur-xl border-l border-accent shadow-[-10px_0_30px_var(--accent-subtle)] z-40 flex flex-col transform transition-transform duration-300">
            <div className="p-4 border-b border-accent/20 flex justify-between items-center">
                <button onClick={onClose} className="text-muted hover:text-accent">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
                </button>
                <GlowingText className="text-lg tracking-widest text-accent">ASSET VAULT</GlowingText>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                <div className="space-y-2">
                    <div className="text-xs font-mono text-muted uppercase tracking-widest border-b border-border pb-1">Connected Wallets</div>
                    <div className="p-3 bg-bg border border-border rounded flex flex-col gap-1 hover:border-accent transition-colors">
                        <span className="text-txt font-mono text-xs truncate">0x1234...abcd</span>
                        <span className="text-ok font-bold">1.25 ETH</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-xs font-mono text-muted uppercase tracking-widest border-b border-border pb-1">NFT Inventory</div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="aspect-square bg-bg border border-border rounded flex items-center justify-center relative overflow-hidden group hover:border-accent">
                            <img src="https://miladymaker.net/milady.png" alt="Milady" className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-0 w-full bg-surface/80 text-[10px] text-center py-1">Milady 3456</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
