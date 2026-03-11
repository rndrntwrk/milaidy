import type { ReactNode } from "react";
import { Button } from "./ui/Button.js";

export type RailBubbleState = "collapsed" | "peek" | "expanded";

export function MiladyRailBubble({
  title,
  state,
  badge,
  icon,
  side,
  onToggleExpand,
}: {
  title: string;
  state: RailBubbleState;
  badge?: string;
  icon: ReactNode;
  side: "left" | "right";
  onToggleExpand: () => void;
}) {
  const expanded = state === "expanded";

  return (
    <div className={`group pointer-events-auto pro-streamer-rail-node pro-streamer-rail-node--${side}`}>
      <Button
        variant={expanded ? "secondary" : "outline"}
        className={`pro-streamer-rail-launcher pro-streamer-rail-launcher--${side} ${expanded ? "pro-streamer-rail-launcher--active" : "pro-streamer-rail-launcher--pulse"} relative h-11 w-11 min-w-11 rounded-full border border-white/12 bg-black/78 px-0 shadow-none backdrop-blur-xl hover:border-white/22 hover:bg-black/88`}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={title}
        title={title}
        onClick={onToggleExpand}
      >
        <span className="flex h-5 w-5 items-center justify-center text-white/82">
          {icon}
        </span>
        {badge ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-black/80 bg-white px-1 text-[9px] font-semibold leading-none text-black">
            {badge}
          </span>
        ) : null}
      </Button>

      <div
        className={`pointer-events-none absolute top-1/2 z-30 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
          side === "left" ? "left-full ml-2" : "right-full mr-2"
        }`}
      >
        <div className="whitespace-nowrap rounded-full border border-white/10 bg-black/88 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/74 shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl">
          {title}
        </div>
      </div>
    </div>
  );
}
