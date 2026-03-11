import React from 'react';

interface GlowingTextProps extends React.HTMLAttributes<HTMLSpanElement> {
    children: React.ReactNode;
    glowColor?: string;
    intensity?: 'low' | 'medium' | 'high';
}

export function GlowingText({
    children,
    glowColor = 'var(--text-strong)',
    intensity = 'medium',
    className = '',
    ...props
}: GlowingTextProps) {
    const shadowValue =
        intensity === 'low' ? `0 0 4px ${glowColor}` :
            intensity === 'high' ? `0 0 12px ${glowColor}, 0 0 24px ${glowColor}` :
                `0 0 8px ${glowColor}`;

    return (
        <span
            className={`font-display ${className}`}
            style={{ textShadow: shadowValue }}
            {...props}
        >
            {children}
        </span>
    );
}
