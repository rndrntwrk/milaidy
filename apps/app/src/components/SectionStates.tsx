import type { ReactNode } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { cn } from "./ui/utils";

type BaseStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  details?: ReactNode;
  className?: string;
};

function BaseState({
  title,
  description,
  actionLabel,
  onAction,
  details,
  className,
}: BaseStateProps) {
  return (
    <Card className={cn("pro-streamer-state-card", className)}>
      <CardHeader className="pro-streamer-state-card__header">
        <CardTitle className="pro-streamer-state-card__title">{title}</CardTitle>
        <CardDescription className="pro-streamer-state-card__description">
          {description}
        </CardDescription>
      </CardHeader>
      {(actionLabel || details) && (
        <CardContent className="pro-streamer-state-card__body">
          {actionLabel && onAction ? (
            <Button type="button" className="pro-streamer-state-card__action" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {details ? (
            <details className="pro-streamer-state-card__details">
              <summary>Technical details</summary>
              <div className="pro-streamer-state-card__details-copy">{details}</div>
            </details>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

export function SectionLoadingState({
  title = "Loading",
  description = "Pulling the latest data for this surface.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return <BaseState title={title} description={description} className={className} />;
}

export function SectionSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={cn("pro-streamer-state-card pro-streamer-state-card--skeleton", className)}>
      <CardHeader className="pro-streamer-state-card__header">
        <div className="h-4 w-32 animate-pulse rounded-full bg-white/8" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded-full bg-white/6" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/6" />
        </div>
      </CardHeader>
      <CardContent className="pro-streamer-state-card__body">
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className="h-10 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: BaseStateProps) {
  return (
    <BaseState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      className={className}
    />
  );
}

export function SectionErrorState({
  title,
  description,
  actionLabel,
  onAction,
  details,
  className,
}: BaseStateProps) {
  return (
    <BaseState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      details={details}
      className={cn("pro-streamer-state-card--error", className)}
    />
  );
}
