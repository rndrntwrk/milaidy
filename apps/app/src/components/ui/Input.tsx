import * as React from "react";
import { cn } from "./utils.js";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-11 w-full rounded-[20px] border border-white/10 bg-black/22 px-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/20 focus-visible:ring-2 focus-visible:ring-white/16",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
