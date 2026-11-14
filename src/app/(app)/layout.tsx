"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Shell } from "@/components/shell";
import { FullScreenLoader } from "@/components/ui";
import { useActiveProfile, useAppStore, useHydrated } from "@/lib/store";

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

  if (!hydrated || !unlocked || !profile) return <FullScreenLoader />;
  return <Shell>{children}</Shell>;
}
