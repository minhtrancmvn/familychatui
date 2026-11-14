"use client";

import { useEffect } from "react";

import { useLang } from "@/lib/i18n";
import { useAppStore, useHydrated } from "@/lib/store";

/** Keeps <html data-theme> and <html lang> in step with Settings and the active profile. */
export function ThemeSync() {
  const hydrated = useHydrated();
  const theme = useAppStore((s) => s.settings.theme);
  const lang = useLang();
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [hydrated, theme, lang]);
  return null;
}
