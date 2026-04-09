import { Check, Copy } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

export interface CopyButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Text to copy to clipboard */
  value: string;
  /** Duration of the "copied" feedback in ms */
  feedbackDuration?: number;
  /** Aria-label for default state */
  copyLabel?: string;
  /** Aria-label for copied state */
  copiedLabel?: string;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      feedbackDuration = 2000,
      copyLabel = "Copy",
      copiedLabel = "Copied",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout>>(null);

    React.useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    const handleCopy = React.useCallback(() => {
      navigator.clipboard.writeText(value).then(
        () => {
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(
            () => setCopied(false),
            feedbackDuration,
          );
        },
        () => {
          /* clipboard write failed — don't show false "copied" feedback */
        },
      );
    }, [value, feedbackDuration]);

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleCopy}
        className={cn(
          "inline-flex items-center gap-1 rounded-md p-1.5 text-muted transition-colors hover:bg-bg-hover hover:text-txt",
          className,
        )}
        aria-label={copied ? copiedLabel : copyLabel}
        {...props}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-ok" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {children}
      </button>
    );
  },
);
CopyButton.displayName = "CopyButton";
