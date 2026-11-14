"use client";

import clsx from "clsx";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ProfileAvatar } from "@/components/avatars";
import { Modal, PRESS } from "@/components/ui";
import type { GuessResult } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * Netflix-style profile lock; the server checks the PIN (`verify`). Render with key={profile.id} so
 * state resets per profile.
 */
export function PinPad({
  profile,
  verify,
  onSuccess,
  onClose,
  title,
  hint,
}: {
  profile: Profile;
  verify: (pin: string) => Promise<GuessResult>;
  onSuccess: (pin: string) => void;
  onClose: () => void;
  /** Defaults to "Enter PIN for {name}". */
  title?: string;
  /** Small line under the avatar, e.g. "Or enter Mom's PIN." */
  hint?: string;
}) {
  const t = useT();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [checking, setChecking] = useState(false);

  const press = useCallback(
    (key: string) => {
      if (checking) return;
      if (key === "back") {
        setDigits((d) => d.slice(0, -1));
        return;
      }
      if (digits.length >= 4) return;
      const next = digits + key;
      setError(null);
      setDigits(next);
      if (next.length < 4) return;
      setChecking(true);
      verify(next)
        .then((result) => {
          if (result === "ok") {
            onSuccess(next);
            return;
          }
          setDigits("");
          setError(result === "wrong" ? t("pin.wrong") : t("pin.wait", { seconds: result.wait }));
          setShakes((n) => n + 1);
        })
        .catch(() => {
          setDigits("");
          setError(t("error.generic"));
        })
        .finally(() => setChecking(false));
    },
    [checking, digits, verify, onSuccess, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <Modal open onClose={onClose} title={title ?? t("pin.title", { name: profile.name })}>
      <div className="flex flex-col items-center">
        <ProfileAvatar profile={profile} size={64} />
        {hint && <p className="mt-2 text-center text-sm text-muted">{hint}</p>}
        <div
          key={shakes}
          role="status"
          className={clsx("mt-5 flex gap-4", shakes > 0 && "shake")}
          aria-label={t("pin.progress", { count: digits.length })}
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={clsx(
                "size-3.5 rounded-full border-2",
                i < digits.length ? "border-accent bg-accent" : error ? "border-danger" : "border-surface-3",
              )}
            />
          ))}
        </div>
        <p role="alert" className={clsx("mt-3 min-h-5 text-center text-sm", error ? "text-danger" : "text-transparent")}>
          {error ?? t("pin.wrong")}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {KEYS.map((key) =>
            key === "" ? (
              <span key="blank" />
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                aria-label={key === "back" ? t("pin.delete") : key}
                className={clsx(
                  "inline-flex size-16 items-center justify-center rounded-full bg-surface-2 text-xl font-medium hover:bg-surface-3",
                  PRESS,
                )}
              >
                {key === "back" ? <Delete className="size-5" /> : key}
              </button>
            ),
          )}
        </div>
      </div>
    </Modal>
  );
}
