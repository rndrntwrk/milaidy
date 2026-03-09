import React from 'react';

interface StatusIndicatorProps {
    status: 'online' | 'offline' | 'warning' | 'error' | 'syncing';
    pulse?: boolean;
    className?: string;
}

export function StatusIndicator({ status, pulse = true, className = '' }: StatusIndicatorProps) {
    const getStatusColor = () => {
        switch (status) {
            case 'online': return 'bg-ok shadow-[0_0_8px_var(--ok)]';
            case 'warning': return 'bg-warn shadow-[0_0_8px_var(--warn)]';
            case 'error': return 'bg-danger shadow-[0_0_8px_var(--danger)]';
            case 'syncing': return 'bg-info shadow-[0_0_8px_var(--info)]';
            case 'offline': default: return 'bg-muted border border-border';
        }
    };

    return (
        <span className={`relative flex h-2 w-2 items-center justify-center ${className}`}>
            {pulse && status !== 'offline' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor().split(' ')[0]}`}></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${getStatusColor()}`}></span>
        </span>
    );
}
