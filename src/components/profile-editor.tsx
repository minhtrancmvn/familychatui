"use client";

import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { ProfileAvatar } from "@/components/avatars";
import { Button, ConfirmDialog, LANG_OPTIONS, Modal, Segmented, Toggle } from "@/components/ui";
import { useLang, useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Lang, Profile } from "@/lib/types";

const EMOJIS = ["🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐧", "🦄", "🐳", "🐙", "🌷", "🌻", "🍀", "⭐", "🚀", "🎮", "🎨", "⚽"];
const COLORS = ["#f97316", "#ec4899", "#0ea5e9", "#22c55e", "#8b5cf6", "#eab308", "#ef4444", "#14b8a6"];

/**
 * Add (profile = null) or edit a profile. Render with a key so state resets. `currentPin` is the PIN
 * the person typed to open someone's locked profile here; the server asks for it again on save.
 */
export function ProfileEditor({
  profile,
  currentPin,
  canDelete,
  onClose,
}: {
  profile: Profile | null;
  currentPin?: string;
  canDelete: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const currentLang = useLang();
  const addProfile = useAppStore((s) => s.addProfile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const deleteProfile = useAppStore((s) => s.deleteProfile);

  const [name, setName] = useState(profile?.name ?? "");
  const [emoji, setEmoji] = useState(profile?.emoji ?? EMOJIS[0]);
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [language, setLanguage] = useState<Lang>(profile?.language ?? currentLang);
  const hadPin = profile?.hasPin ?? false;
  const [pinOn, setPinOn] = useState(hadPin);
  // Blank keeps the existing PIN; the PIN itself is never sent back to the browser.
  const [pin, setPin] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pinValid = /^\d{4}$/.test(pin);
  const keepPin = pinOn && hadPin && pin === "";
  const valid = name.trim().length > 0 && (!pinOn || pinValid || keepPin);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!valid || busy) return;
    const data = { name: name.trim(), emoji, color, language, pin: !pinOn ? null : keepPin ? undefined : pin };
    void run(() => (profile ? updateProfile(profile.id, data, currentPin) : addProfile(data, currentPin)));
  }

  return (
    <Modal open onClose={onClose} title={profile ? t("editor.editTitle") : t("editor.addTitle")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-5"
      >
        <div className="flex justify-center">
          <ProfileAvatar profile={{ emoji, color }} size={80} />
        </div>

        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium">
            {t("editor.name")}
          </label>
          <input
            id="profile-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("editor.namePlaceholder")}
            className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-accent"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t("editor.avatar")}</legend>
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={e}
                aria-pressed={e === emoji}
                onClick={() => setEmoji(e)}
                className={clsx(
                  "aspect-square min-h-11 rounded-lg text-xl transition-colors sm:min-h-0",
                  e === emoji ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-surface-2",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t("editor.color", { value: c })}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={clsx("size-11 rounded-full ring-offset-2 ring-offset-surface sm:size-8", c === color && "ring-2 ring-text")}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{t("language")}</span>
          <Segmented label={t("language")} value={language} options={LANG_OPTIONS} onChange={setLanguage} />
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{t("editor.pin")}</div>
              <div className="text-xs text-muted">{t("editor.pinHelp")}</div>
            </div>
            <Toggle label={t("editor.pinToggle")} checked={pinOn} onChange={setPinOn} />
          </div>
          {pinOn && (
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={hadPin ? "••••" : t("editor.pinPlaceholder")}
              aria-label={t("editor.pin")}
              className="mt-3 h-12 w-full rounded-xl border border-border bg-surface px-3 text-center font-mono text-lg tracking-[0.5em] outline-none focus:border-accent"
            />
          )}
        </div>

        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t("error.generic")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {profile && canDelete && (
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              {t("editor.delete")}
            </Button>
          )}
          <div className="flex-1" />
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {t("editor.save")}
          </Button>
        </div>
      </form>

      {profile && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={t("editor.confirmTitle", { name: profile.name })}
          body={t("editor.confirmBody")}
          confirmLabel={t("editor.delete")}
          onConfirm={() => void run(() => deleteProfile(profile.id, currentPin))}
        />
      )}
    </Modal>
  );
}
