import * as React from "react";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return React.cloneElement(children, { title: label });
}
