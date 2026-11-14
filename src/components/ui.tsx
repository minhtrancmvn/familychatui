"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Shared press feedback: buttons step on hover (colour) and press on click (scale). */
export const PRESS = "transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97]";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium",
        PRESS,
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        // 44px on phones (tap size), tighter on desktop.
        size === "sm" && "h-11 px-3 text-sm md:h-8",
        size === "md" && "h-11 px-4 text-sm md:h-10",
        size === "lg" && "h-12 px-5 text-base",
        variant === "primary" && "bg-accent-strong text-accent-fg hover:bg-accent-strong-hover",
        variant === "secondary" && "border border-border bg-surface hover:bg-surface-2",
        variant === "ghost" && "hover:bg-surface-2",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted md:size-9",
        PRESS,
        "hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body>: a transformed ancestor (the phone drawer) would otherwise trap `fixed` inside it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:max-w-md sm:rounded-2xl",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label={t("close")} onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-muted">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        // The ::before pad grows the hit area to 44px without changing the look.
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={clsx(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** Two-or-more option switch (theme, language). */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-10 rounded-lg px-3.5 text-sm font-medium md:h-8",
            PRESS,
            o.value === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const LANG_OPTIONS: ReadonlyArray<{ value: Lang; label: string }> = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

/**
 * Shown while the browser store loads. It renders during hydration, so it must not read the store:
 * the server has no saved profile, the browser does, and a translated label would differ between them.
 */
export function FullScreenLoader() {
  return (
    <div className="flex h-dvh items-center justify-center" aria-busy="true" aria-label="Loading / Đang tải">
      <div className="size-7 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
    </div>
  );
}
