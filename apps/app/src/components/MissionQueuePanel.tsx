import { useEffect, useState } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { client, type AutonomyApproval } from '../api-client.js';
import { useApp } from '../AppContext.js';

export function MissionQueuePanel() {
    const { triggers, loadTriggers } = useApp();
    const [approvals, setApprovals] = useState<AutonomyApproval[]>([]);

    useEffect(() => {
        let mounted = true;
        const fetchMissions = async () => {
            try {
                const res = await client.getApprovals();
                if (mounted) setApprovals(res.pending || []);
            } catch (err) {
                console.error("Failed to fetch approvals", err);
            }
        };

        void fetchMissions();
        void loadTriggers();

        const interval = setInterval(fetchMissions, 10000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [loadTriggers]);

    return (
        <SciFiPanel variant="glass" className="h-64 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4 flex justify-between items-center">
                <GlowingText className="text-sm tracking-widest text-accent">MISSION QUEUE</GlowingText>
                <span className="text-[10px] text-accent font-mono">{approvals.length + triggers.length} TOTAL</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {approvals.map(a => (
                    <div key={a.id} className="bg-bg/50 border border-warn/50 p-2 rounded flex justify-between items-center w-full">
                        <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-xs font-mono font-bold text-warn truncate" title={a.toolName}>{a.toolName}</span>
                            <span className="text-[10px] uppercase text-muted">Approval Req</span>
                        </div>
                        <span className="text-[10px] text-bg bg-warn px-2 py-1 rounded font-bold shrink-0">PENDING</span>
                    </div>
                ))}

                {triggers.map(t => (
                    <div key={t.id} className={`bg-bg/50 border ${t.enabled ? 'border-accent/30' : 'border-border'} p-2 rounded flex justify-between items-center w-full ${!t.enabled ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-xs font-mono font-bold text-txt truncate" title={t.displayName}>{t.displayName}</span>
                            <span className="text-[10px] uppercase text-muted truncate">{t.triggerType}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded shrink-0 font-bold ${t.enabled ? 'text-ok bg-ok/10' : 'text-muted bg-muted/10'}`}>
                            {t.enabled ? 'ACTIVE' : 'IDLE'}
                        </span>
                    </div>
                ))}

                {approvals.length === 0 && triggers.length === 0 && (
                    <div className="text-xs font-mono text-muted text-center py-4">NO ACTIVE MISSIONS</div>
                )}
            </div>
        </SciFiPanel>
    );
}
