import React from 'react';
import { useApp } from '../AppContext.js';
import { AgentCore } from './AgentCore.js';
import { CommandDock } from './CommandDock.js';

// Left Panels
import { RuntimeHealthPanel } from './RuntimeHealthPanel.js';
import { CognitiveTracePanel } from './CognitiveTracePanel.js';
import { MemoryConsolePanel } from './MemoryConsolePanel.js';

// Right Panels
import { ActionDeckPanel } from './ActionDeckPanel.js';
import { MissionQueuePanel } from './MissionQueuePanel.js';
import { ChannelsFeedsPanel } from './ChannelsFeedsPanel.js';

// Drawers
import { ThreadsDrawer } from './ThreadsDrawer.js';
import { AssetVaultDrawer } from './AssetVaultDrawer.js';
import { ControlStackModal } from './ControlStackModal.js';
import { useState } from 'react';

export function MiladyOsDashboard() {
    const { agentStatus } = useApp();

    const [threadsOpen, setThreadsOpen] = useState(false);
    const [vaultOpen, setVaultOpen] = useState(false);
    const [controlStackOpen, setControlStackOpen] = useState(false);

    return (
        <div className="flex flex-col flex-1 h-screen w-full bg-surface text-txt font-body overflow-hidden relative">
            {/* Decorative HUD background effects */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vh] h-[80vh] bg-accent/5 rounded-full blur-[100px]" />
            </div>

            <div className="flex flex-1 min-h-0 relative z-10 p-2 lg:p-4 pb-20 gap-4" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(500px, 2fr) minmax(300px, 1fr)', gap: '1rem' }}>

                {/* Left Satellite Panels */}
                <aside className="flex flex-col gap-4 min-w-0 overflow-y-auto hidden lg:flex pb-16">
                    <RuntimeHealthPanel />
                    <CognitiveTracePanel />
                    <MemoryConsolePanel />
                </aside>

                {/* Center Core */}
                <main className="flex flex-col min-w-0 h-full relative border border-accent/20 rounded-lg shadow-[0_0_30px_var(--accent-subtle)] bg-card/40 backdrop-blur-md pb-16">
                    <AgentCore />
                </main>

                {/* Right Satellite Panels */}
                <aside className="flex flex-col gap-4 min-w-0 overflow-y-auto hidden lg:flex pb-16">
                    <ActionDeckPanel />
                    <MissionQueuePanel />
                    <ChannelsFeedsPanel />
                </aside>

            </div>

            {/* Bottom Command Strip */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-xl border-t border-accent/20 z-20 flex items-center justify-center px-4">
                <CommandDock
                    onOpenThreads={() => setThreadsOpen(true)}
                    onOpenVault={() => setVaultOpen(true)}
                    onOpenControlStack={() => setControlStackOpen(true)}
                />
            </div>

            {/* Drawers and Modals */}
            <ThreadsDrawer open={threadsOpen} onClose={() => setThreadsOpen(false)} />
            <AssetVaultDrawer open={vaultOpen} onClose={() => setVaultOpen(false)} />
            <ControlStackModal open={controlStackOpen} onClose={() => setControlStackOpen(false)} />
        </div>
    );
}
