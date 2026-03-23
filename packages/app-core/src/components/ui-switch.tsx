import type { ButtonHTMLAttributes } from "react";

type SwitchSize = "default" | "compact";

type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onChange" | "onClick" | "role" | "aria-checked"
> & {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: SwitchSize;
  trackOnClass?: string;
  trackOffClass?: string;
  knobClass?: string;
  disabledClassName?: string;
};

const SIZE_CLASS: Record<SwitchSize, string> = {
  default: "h-6 w-10 min-h-6 max-h-6 p-0.5",
  compact: "h-5 w-9 min-h-5 max-h-5 p-0.5",
};

const KNOB_CLASS: Record<SwitchSize, string> = {
  default: "h-4 w-4",
  compact: "h-3.5 w-3.5",
};

const KNOB_TRAVEL_CLASS: Record<SwitchSize, string> = {
  default: "translate-x-4",
  compact: "translate-x-[0.875rem]",
};

export function Switch({
  checked,
  onChange,
  size = "default",
  trackOnClass = "bg-[var(--accent)]",
  trackOffClass = "bg-[var(--border)]",
  knobClass = "bg-white",
  disabledClassName = "opacity-40 cursor-default",
  disabled,
  className = "",
  ...buttonProps
}: SwitchProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`relative inline-flex shrink-0 items-center justify-start rounded-full transition-colors duration-200 focus:outline-none box-border ${SIZE_CLASS[size]} ${checked ? trackOnClass : trackOffClass} ${disabled ? disabledClassName : "cursor-pointer"} ${className}`}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span
        className={`pointer-events-none block shrink-0 rounded-full shadow-sm transition-transform duration-200 ease-out ${KNOB_CLASS[size]} ${knobClass} ${checked ? KNOB_TRAVEL_CLASS[size] : "translate-x-0"}`}
      />
    </button>
  );
}
