import * as React from "react";
import { cn } from "./utils.js";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-[20px] border border-white/10 bg-black/22 px-4 text-sm text-white outline-none transition-colors focus:border-white/20 focus-visible:ring-2 focus-visible:ring-white/16",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
