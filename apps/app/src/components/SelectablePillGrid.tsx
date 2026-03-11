import { Button } from "./ui/Button";
import { cn } from "./ui/utils";

export type SelectablePillOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function SelectablePillGrid<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "default",
}: {
  options: Array<SelectablePillOption<T>>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
  size?: "default" | "compact";
}) {
  return (
    <div className={cn("pro-streamer-pill-grid", {
      "pro-streamer-pill-grid--compact": size === "compact",
    }, className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={option.disabled}
          className={cn("pro-streamer-pill-grid__item", {
            "pro-streamer-pill-grid__item--active": option.value === value,
            "pro-streamer-pill-grid__item--disabled": option.disabled,
          })}
        >
          <span className="pro-streamer-pill-grid__label">{option.label}</span>
          {option.description ? (
            <span className="pro-streamer-pill-grid__description">{option.description}</span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
