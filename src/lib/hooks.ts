import { type RefObject, useEffect, useSyncExternalStore } from "react";

/** Calls onDismiss on Escape or a pointer-down outside every given element. */
export function useDismiss(
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (refs.every((r) => !r.current || !r.current.contains(target))) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [refs, onDismiss, enabled]);
}

const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
};
const getMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const getServerMinute = () => 0;

/** Current time rounded to the minute; re-renders about once a minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribeMinute, getMinute, getServerMinute);
}

/** Copies text, with a fallback for plain-http pages where navigator.clipboard is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
