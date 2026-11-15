"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Shell } from "@/components/shell";
import { FullScreenLoader } from "@/components/ui";
import { displayMode, setUserProperties, track } from "@/lib/analytics";
import { useActiveProfile, useAppStore, useHydrated } from "@/lib/store";

let opened = false;

/** Signed-in area: needs the family password on this device and a chosen profile. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const unlocked = useAppStore((s) => s.unlocked);
  const profile = useActiveProfile();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!unlocked) router.replace("/login");
    else if (!profile) router.replace("/profiles");
  }, [hydrated, unlocked, profile, router]);

  // Analytics: who is using the app, without naming them, and one app_open per page load.
  const language = profile?.language;
  const isAdmin = profile?.isAdmin;
  useEffect(() => {
    if (!language) return;
    const mode = displayMode();
    setUserProperties({ ui_language: language, is_admin: isAdmin ? "yes" : "no", display_mode: mode });
    if (!opened) {
      opened = true;
      track("app_open", { display_mode: mode });
    }
  }, [language, isAdmin]);

  if (!hydrated || !unlocked || !profile) return <FullScreenLoader />;
  return <Shell>{children}</Shell>;
}
