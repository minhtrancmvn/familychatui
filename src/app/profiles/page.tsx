"use client";

import clsx from "clsx";
import { Lock, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ProfileAvatar } from "@/components/avatars";
import { Logo } from "@/components/logo";
import { PinPad } from "@/components/pin-pad";
import { ProfileEditor } from "@/components/profile-editor";
import { Button, FullScreenLoader } from "@/components/ui";
import { APP_NAME } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { useAppStore, useHydrated } from "@/lib/store";
import type { Profile } from "@/lib/types";

const MAX_PROFILES = 8;
const AVATAR = 104;

export default function ProfilesPage() {
  const t = useT();
  const hydrated = useHydrated();
  const unlocked = useAppStore((s) => s.unlocked);
  const profiles = useAppStore((s) => s.profiles);
  const selectProfile = useAppStore((s) => s.selectProfile);
  const verifyPin = useAppStore((s) => s.verifyPin);
  const lockDevice = useAppStore((s) => s.lockDevice);
  const router = useRouter();

  const [managing, setManaging] = useState(false);
  /** profile null = adding. `pin` is the PIN that unlocked it; `asAdmin` when that was the admin's PIN. */
  const [editing, setEditing] = useState<{ profile: Profile | null; pin?: string; asAdmin: boolean } | null>(null);
  const [pinFor, setPinFor] = useState<{ profile: Profile; purpose: "enter" | "edit" | "add" } | null>(null);
  /** The admin's PIN, remembered while "Manage profiles" stays open, so it's asked once. */
  const [adminPin, setAdminPin] = useState<string | null>(null);
  const lastRights = useRef<"self" | "admin">("self");

  useEffect(() => {
    if (hydrated && !unlocked) router.replace("/login");
  }, [hydrated, unlocked, router]);

  if (!hydrated || !unlocked) return <FullScreenLoader />;

  const admin = profiles.find((p) => p.isAdmin) ?? null;
  // Without an admin PIN there's nothing to prove: anyone could open the admin's profile anyway.
  const adminOpen = !admin || !admin.hasPin;

  const pick = (p: Profile) => {
    if (!managing) {
      if (p.hasPin) setPinFor({ profile: p, purpose: "enter" });
      else void selectProfile(p.id).then((result) => result === "ok" && router.push("/"));
    } else if (adminPin || adminOpen) {
      setEditing({ profile: p, pin: adminPin ?? undefined, asAdmin: true });
    } else if (p.hasPin) {
      setPinFor({ profile: p, purpose: "edit" });
    } else {
      setEditing({ profile: p, asAdmin: false });
    }
  };

  const add = () => {
    if (adminPin || adminOpen) setEditing({ profile: null, pin: adminPin ?? undefined, asAdmin: true });
    else if (admin) setPinFor({ profile: admin, purpose: "add" });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
        <Logo size={22} />
        {APP_NAME}
      </div>
      <h1 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
        {managing ? t("profiles.manageTitle") : t("profiles.title")}
      </h1>

      {profiles.length === 0 && <p className="mt-3 text-center text-sm text-muted">{t("profiles.empty")}</p>}
      <ul className="mt-10 flex max-w-5xl flex-wrap justify-center gap-x-5 gap-y-8 md:gap-x-10">
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => pick(p)}
              aria-label={managing ? t("profiles.edit", { name: p.name }) : p.hasPin ? t("profiles.locked", { name: p.name }) : p.name}
              className="group flex w-28 flex-col items-center gap-3 outline-none md:w-32"
            >
              <span
                className={clsx(
                  "relative rounded-[22%] ring-accent ring-offset-4 ring-offset-bg transition-[box-shadow,transform] duration-150 group-hover:-translate-y-0.5 group-active:scale-[0.97]",
                  "group-hover:ring-4 group-focus-visible:ring-4",
                )}
              >
                <ProfileAvatar profile={p} size={AVATAR} />
                {managing && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-[22%] bg-black/45">
                    <Pencil className="size-7 text-white" />
                  </span>
                )}
                {!managing && p.hasPin && (
                  <span className="absolute -bottom-1.5 -right-1.5 inline-flex size-7 items-center justify-center rounded-full border-2 border-bg bg-surface text-muted">
                    <Lock className="size-3.5" />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-sm font-medium text-muted group-hover:text-text">{p.name}</span>
            </button>
          </li>
        ))}
        {profiles.length < MAX_PROFILES && (
          <li>
            <button type="button" onClick={add} className="group flex w-28 flex-col items-center gap-3 md:w-32">
              <span
                className="flex items-center justify-center rounded-[22%] border-2 border-dashed border-border text-muted transition-colors group-hover:border-accent group-hover:text-accent-text"
                style={{ width: AVATAR, height: AVATAR }}
              >
                <Plus className="size-9" />
              </span>
              <span className="text-sm font-medium text-muted group-hover:text-text">{t("profiles.add")}</span>
            </button>
          </li>
        )}
      </ul>

      <Button
        className="mt-12"
        onClick={() => {
          setManaging((v) => !v);
          setAdminPin(null);
        }}
      >
        {managing ? t("done") : t("profiles.manage")}
      </Button>
      <button
        type="button"
        onClick={() => {
          lockDevice();
          router.replace("/login");
        }}
        className="mt-2 inline-flex min-h-11 items-center px-3 text-xs text-muted underline-offset-2 hover:underline"
      >
        {t("profiles.logout")}
      </button>

      {pinFor && (
        <PinPad
          key={`${pinFor.purpose}-${pinFor.profile.id}`}
          profile={pinFor.profile}
          title={pinFor.purpose === "add" ? t("pin.adminTitle", { name: pinFor.profile.name }) : undefined}
          hint={
            pinFor.purpose === "edit" && admin && !pinFor.profile.isAdmin ? t("pin.orAdmin", { name: admin.name }) : undefined
          }
          verify={async (pin) => {
            if (pinFor.purpose === "enter") return selectProfile(pinFor.profile.id, pin);
            const result = await verifyPin(pinFor.profile.id, pin);
            if (result !== "self" && result !== "admin") return result;
            lastRights.current = result;
            // Adding needs the admin's PIN, not just any PIN.
            return pinFor.purpose === "add" && result !== "admin" ? "wrong" : "ok";
          }}
          onClose={() => setPinFor(null)}
          onSuccess={(pin) => {
            setPinFor(null);
            if (pinFor.purpose === "enter") {
              router.push("/");
              return;
            }
            const asAdmin = lastRights.current === "admin";
            if (asAdmin) setAdminPin(pin);
            setEditing({ profile: pinFor.purpose === "add" ? null : pinFor.profile, pin, asAdmin });
          }}
        />
      )}
      {editing !== null && (
        <ProfileEditor
          key={editing.profile?.id ?? "new"}
          profile={editing.profile}
          currentPin={editing.pin}
          canDelete={editing.asAdmin && !!editing.profile && !editing.profile.isAdmin && profiles.length > 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
