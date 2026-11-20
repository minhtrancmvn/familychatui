"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type MouseEvent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { PRESS } from "@/components/ui";
import { useT } from "@/lib/i18n";

export interface LightboxPhoto {
  id: string;
  name: string;
  src: string;
}

const BUTTON = `inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white ${PRESS}`;

/**
 * Full-screen view of one photo on solid black (in both themes, like a phone's photo viewer). Closes with the X, Escape or a tap beside the photo.
 * With several photos: arrow buttons, arrow keys and a sideways swipe move between them.
 */
export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  // A mouse drag ends in a click on the backdrop; that click must not close the lightbox.
  const dragged = useRef(false);
  const photo = photos[index];
  const many = photos.length > 1;
  const go = (step: number) => onIndex((index + step + photos.length) % photos.length);

  // Focus moves into the lightbox and returns to the thumbnail when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => before?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowLeft") go(-1);
      else if (many && e.key === "ArrowRight") go(1);
      else if (e.key === "Tab") {
        // Keep Tab inside the lightbox.
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!photo) return null;
  const closeIfBeside = (e: MouseEvent) => {
    if (dragged.current) dragged.current = false;
    else if (e.target === e.currentTarget) onClose();
  };

  // Portal to <body>: a transformed ancestor (the phone drawer) would otherwise trap `fixed` inside it.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.name}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onClick={closeIfBeside}
    >
      <div
        className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
        onClick={closeIfBeside}
      >
        <span className="min-w-0 flex-1 truncate px-2 text-sm text-white/80">
          {photo.name}
          {many && <span className="text-white/60"> · {index + 1} / {photos.length}</span>}
        </span>
        <button ref={closeRef} type="button" aria-label={t("close")} title={t("close")} onClick={onClose} className={BUTTON}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" onClick={closeIfBeside}>
        <div
          // Sideways swipes are ours; vertical pans and pinch-zoom stay with the browser.
          className="relative flex-1 touch-pan-y touch-pinch-zoom"
          onClick={closeIfBeside}
          onPointerDown={(e) => {
            swipeStart.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            dragged.current = Math.hypot(dx, dy) > 10;
            if (many && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private photo behind the session cookie, not a static asset for the optimizer */}
          <img
            key={photo.id}
            src={photo.src}
            alt={photo.name}
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
          />
          {many && (
            <>
              <button
                type="button"
                aria-label={t("lightbox.previous")}
                onClick={() => go(-1)}
                className={`${BUTTON} absolute top-1/2 left-0 -translate-y-1/2`}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label={t("lightbox.next")}
                onClick={() => go(1)}
                className={`${BUTTON} absolute top-1/2 right-0 -translate-y-1/2`}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
