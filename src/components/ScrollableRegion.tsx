import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../lib/utils";

type ScrollableRegionProps = ComponentPropsWithoutRef<"div"> & {
  label: string;
};

const baseClassName = [
  "max-h-[min(60dvh,30rem)] overflow-auto overscroll-contain",
  "[scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-[#1b5660]/50 sm:max-h-[min(65dvh,36rem)]",
].join(" ");

export function ScrollableRegion({
  label,
  className,
  children,
  ...props
}: ScrollableRegionProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(baseClassName, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ScrollableTableRegion({
  label,
  className,
  children,
  ...props
}: ScrollableRegionProps) {
  return (
    <ScrollableRegion
      label={label}
      className={cn(
        "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
        className,
      )}
      {...props}
    >
      {children}
    </ScrollableRegion>
  );
}
