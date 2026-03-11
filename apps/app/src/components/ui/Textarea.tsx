import * as React from "react";
import { cn } from "./utils.js";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[88px] w-full rounded-[20px] border border-white/10 bg-black/22 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/20 focus-visible:ring-2 focus-visible:ring-white/16",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
