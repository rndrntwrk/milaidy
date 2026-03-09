import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { cn } from "./ui/utils";

type SectionShellProps = {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionShell({
  title,
  description,
  toolbar,
  children,
  className,
  contentClassName,
}: SectionShellProps) {
  return (
    <Card className={cn("pro-streamer-section-shell", className)}>
      <CardHeader className="pro-streamer-section-shell__header">
        <div className="pro-streamer-section-shell__heading">
          <CardTitle className="pro-streamer-section-shell__title">{title}</CardTitle>
          {description ? (
            <CardDescription className="pro-streamer-section-shell__description">
              {description}
            </CardDescription>
          ) : null}
        </div>
        {toolbar ? <div className="pro-streamer-section-shell__toolbar">{toolbar}</div> : null}
      </CardHeader>
      <CardContent className={cn("pro-streamer-section-shell__content", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
