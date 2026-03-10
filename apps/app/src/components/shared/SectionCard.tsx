/**
 * Section card — a bordered card with title accent bar.
 * Used for settings sections and similar grouped content.
 */
import type React from "react";

export interface SectionCardProps {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  id,
  title,
  description,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={`p-5 border border-border bg-card rounded-xl shadow-sm transition-all duration-200 ${className}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-1 h-6 bg-accent rounded-full" />
        <h3 className="font-bold text-base text-txt-strong">{title}</h3>
      </div>
      {description && <p className="text-sm text-muted mb-4">{description}</p>}
      {children}
    </section>
  );
}
