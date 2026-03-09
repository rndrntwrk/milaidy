import * as React from "react";
import { cn } from "./utils.js";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-white/15 bg-white/90 text-black hover:bg-white",
  outline:
    "border border-white/12 bg-black/35 text-white/78 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  ghost:
    "border border-transparent bg-transparent text-white/72 hover:bg-white/[0.06] hover:text-white",
  secondary:
    "border border-accent/25 bg-accent/12 text-accent hover:bg-accent/18",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-full px-3 text-[11px] uppercase tracking-[0.22em]",
  md: "h-10 rounded-full px-4 text-[11px] uppercase tracking-[0.22em]",
  lg: "h-11 rounded-full px-5 text-[12px] uppercase tracking-[0.24em]",
  icon: "h-10 w-10 rounded-full p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 backdrop-blur-xl",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
