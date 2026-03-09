import React from 'react';
import { useApp } from '../AppContext.js';
import { SciFiPanel } from './ui/SciFiPanel.js';

export function AgentCore() {
    const {
        chatAvatarVisible,
        chatAgentVoiceMuted,
        chatAvatarSpeaking,
        agentStatus,
        activeConversationId
    } = useApp();

    return (
        <div className="flex flex-col h-full w-full relative">
            {/* Absolute center avatar */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-20">
                <div className="w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-accent/10 rounded-full blur-[50px] animate-pulse" />
            </div>

            <div className="flex-1 overflow-y-auto relative z-10 flex flex-col items-center justify-center p-8">
                {/* Placeholder for real Agent Core components */}
                <img
                    src={chatAvatarVisible ? "/avatars/avatar-hologram.png" : "https://miladymaker.net/milady.png"}
                    alt="Agent Core"
                    className="w-48 h-48 md:w-64 md:h-64 object-cover rounded-full border-4 border-accent shadow-[0_0_50px_var(--accent)]"
                />
                <div className="mt-8 text-center bg-card/80 backdrop-blur border border-accent/50 p-4 rounded-md">
                    <h2 className="text-xl font-display text-accent mb-2">LOCAL NEURAL CORE ACTIVE</h2>
                    <p className="text-sm font-mono text-muted">Awaiting sync block {activeConversationId}</p>
                </div>
            </div>

            <div className="p-4 border-t border-accent/20 bg-card/60 backdrop-blur z-10">
                {/* Chat composer placeholder */}
                <div className="flex items-center w-full border border-accent/50 bg-bg p-2 rounded justify-between px-4">
                    <span className="text-muted font-mono animate-pulse">SYSTEM AWAITING COMMAND...</span>
                    <div className="w-2 h-4 bg-accent animate-ping" />
                </div>
            </div>
        </div>
    );
}
