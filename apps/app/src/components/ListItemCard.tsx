import type { ReactNode } from "react";
import { Card } from "./ui/Card";
import { cn } from "./ui/utils";

type ListItemCardProps = {
  title: string;
  meta?: string;
  active?: boolean;
  unread?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
};

export function ListItemCard({
  title,
  meta,
  active,
  unread,
  onClick,
  trailing,
  className,
}: ListItemCardProps) {
  const body = (
    <Card
      className={cn(
        "pro-streamer-list-item w-full",
        { "pro-streamer-list-item--active": active },
        className,
      )}
    >
      <div className="pro-streamer-list-item__content">
        <div className="pro-streamer-list-item__copy">
          <div className="pro-streamer-list-item__title-row">
            <span className="pro-streamer-list-item__status-slot" aria-hidden="true">
              {unread ? <span className="pro-streamer-list-item__unread" /> : null}
            </span>
            <span className="pro-streamer-list-item__title">{title}</span>
          </div>
          {meta ? <span className="pro-streamer-list-item__meta">{meta}</span> : null}
        </div>
      </div>
      {trailing ? <div className="pro-streamer-list-item__trailing">{trailing}</div> : null}
    </Card>
  );

  if (!onClick) return body;

  return (
    <button
      type="button"
      className="pro-streamer-list-item-button"
      onClick={onClick}
      aria-pressed={active}
    >
      {body}
    </button>
  );
}
