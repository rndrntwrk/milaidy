import React from 'react';
import { NeonButton } from './ui/NeonButton.js';

interface CommandDockProps {
    onOpenThreads?: () => void;
    onOpenVault?: () => void;
    onOpenControlStack?: () => void;
}

export function CommandDock({ onOpenThreads, onOpenVault, onOpenControlStack }: CommandDockProps) {
    return (
        <div className="flex items-center gap-2 sm:gap-4 bg-card/80 backdrop-blur-md px-2 sm:px-6 py-2 rounded-t-xl border border-accent shadow-[0_-10px_30px_var(--accent-subtle)] overflow-x-auto max-w-full">
            <NeonButton variant="outline" size="sm" onClick={onOpenThreads}>THREADS</NeonButton>
            <NeonButton variant="outline" size="sm">ASK</NeonButton>
            <NeonButton variant="primary" size="lg" className="mx-2 sm:mx-4 font-bold tracking-widest" onClick={onOpenControlStack}>
                CORE A.I.
            </NeonButton>
            <NeonButton variant="outline" size="sm">MEMORY</NeonButton>
            <NeonButton variant="outline" size="sm">ACTIONS</NeonButton>
            <NeonButton variant="outline" size="sm" onClick={onOpenVault}>VAULT</NeonButton>
        </div>
    );
}
