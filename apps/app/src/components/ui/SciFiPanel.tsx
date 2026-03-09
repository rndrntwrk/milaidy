import React from 'react';

interface SciFiPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'glass';
  glowColor?: string;
}

export function SciFiPanel({ 
  children, 
  variant = 'default',
  glowColor = 'var(--accent)',
  className = '', 
  ...props 
}: SciFiPanelProps) {
  const bg = variant === 'elevated' ? 'bg-bg-elevated' : variant === 'glass' ? 'bg-card/80 backdrop-blur-md' : 'bg-card';
  return (
    <div 
      className={`relative border border-border rounded-sm overflow-hidden ${bg} ${className}`}
      {...props}
    >
      {/* Decorative corner brackets or glowing overlays */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-accent opacity-50" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-accent opacity-50" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-accent opacity-50" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-accent opacity-50" />
      
      {/* Optional ambient inner glow via mask or box-shadow */}
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 20px -10px ${glowColor}` }} />

      <div className="relative z-10 w-full h-full p-3 lg:p-4">
        {children}
      </div>
    </div>
  );
}
