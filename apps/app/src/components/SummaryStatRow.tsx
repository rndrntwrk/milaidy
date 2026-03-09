import { Card } from "./ui/Card";
import { cn } from "./ui/utils";

type SummaryTone = "default" | "positive" | "warning" | "danger";

export type SummaryStatItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: SummaryTone;
};

const toneClass: Record<SummaryTone, string> = {
  default: "text-white/78",
  positive: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
};

export function SummaryStatRow({
  items,
  className,
}: {
  items: SummaryStatItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => item.value && item.value.trim().length > 0);
  return (
    <div className={cn("pro-streamer-summary-stat-row", className)}>
      {visibleItems.map((item) => (
        <Card key={item.label} className="pro-streamer-summary-stat-row__item">
          <div className="pro-streamer-summary-stat-row__label">{item.label}</div>
          <div className={cn("pro-streamer-summary-stat-row__value", toneClass[item.tone ?? "default"])}>
            {item.value}
          </div>
          {item.hint ? <div className="pro-streamer-summary-stat-row__hint">{item.hint}</div> : null}
        </Card>
      ))}
    </div>
  );
}
