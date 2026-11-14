"use client";

import clsx from "clsx";
import { type ReactNode, useCallback, useMemo, useRef } from "react";

import { useDismiss } from "@/lib/hooks";

/** Trigger + floating panel, positioned relative to the wrapper. Closes on outside click or Escape. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  className,
  wrapperClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  /** Positions the panel, e.g. "bottom-full left-0 mb-2". */
  className?: string;
  wrapperClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [ref], []);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismiss(refs, close, open);
  return (
    <div ref={ref} className={clsx("relative", wrapperClassName)}>
      {trigger}
      {open && <div className={clsx("absolute z-40", className)}>{children}</div>}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2",
        danger && "text-danger",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
