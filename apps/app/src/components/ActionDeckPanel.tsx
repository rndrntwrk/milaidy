import { useMemo } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { NeonButton } from './ui/NeonButton.js';
import { useApp } from '../AppContext.js';

const TARGET_PLUGINS = [
    { label: 'DISCORD', match: 'discord' },
    { label: 'TELEGRAM', match: 'telegram' },
    { label: 'TWITTER', match: 'twitter' },
    { label: 'TERMINAL', match: 'direct' }
];

export function ActionDeckPanel() {
    const { plugins } = useApp();

    const deckButtons = useMemo(() => {
        return TARGET_PLUGINS.map(target => {
            const plugin = plugins.find(p => p.id.toLowerCase().includes(target.match) || p.name.toLowerCase().includes(target.match));
            const isActive = plugin?.isActive && plugin?.enabled;
            return {
                label: target.label,
                variant: isActive ? 'primary' : 'outline' as 'primary' | 'outline',
                status: isActive ? 'ACTIVE' : (plugin?.enabled ? 'STANDBY' : 'OFFLINE')
            };
        });
    }, [plugins]);

    return (
        <SciFiPanel variant="glass" className="h-48 flex flex-col">
            <div className="border-b border-accent/20 pb-2 mb-4">
                <GlowingText className="text-sm tracking-widest text-accent">ACTION DECK</GlowingText>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2">
                {deckButtons.map(btn => (
                    <NeonButton key={btn.label} variant={btn.variant} size="sm" className="w-full flex-col items-center justify-center p-2 h-auto" title={btn.status}>
                        <div className="text-xs">{btn.label}</div>
                        <div className={`text-[9px] mt-1 ${btn.variant === 'primary' ? 'text-bg' : 'text-muted'}`}>{btn.status}</div>
                    </NeonButton>
                ))}
            </div>
        </SciFiPanel>
    );
}
