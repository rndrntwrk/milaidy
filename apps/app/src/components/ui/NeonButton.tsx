import React from 'react';

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'ghost';
    glowColor?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function NeonButton({
    children,
    variant = 'primary',
    size = 'md',
    glowColor = 'var(--accent)',
    className = '',
    ...props
}: NeonButtonProps) {
    const baseClasses = "relative inline-flex items-center justify-center font-display uppercase tracking-wider transition-all duration-200 overflow-hidden group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

    const sizeClasses = size === 'sm' ? "text-[10px] px-2 py-1" : size === 'lg' ? "text-sm px-6 py-3" : "text-xs px-4 py-2";

    let variantClasses = "";
    if (variant === 'primary') {
        variantClasses = "bg-accent text-accent-fg border border-accent shadow-[0_0_10px_var(--accent-subtle)] hover:shadow-[0_0_15px_var(--accent-muted)] hover:bg-accent-hover";
    } else if (variant === 'outline') {
        variantClasses = "bg-transparent text-accent border border-accent shadow-[inset_0_0_5px_var(--accent-subtle)] hover:bg-accent-subtle";
    } else {
        variantClasses = "bg-transparent text-txt hover:text-accent hover:bg-accent-subtle";
    }

    return (
        <button
            className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
            {...props}
        >
            <span className="relative z-10 flex items-center gap-2">{children}</span>
            {variant !== 'ghost' && (
                <span
                    className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ boxShadow: `inset 0 0 10px ${glowColor}` }}
                />
            )}
        </button>
    );
}
