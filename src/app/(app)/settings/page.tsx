"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";

import { ModelAvatar, ProfileAvatar } from "@/components/avatars";
import { ProfileEditor } from "@/components/profile-editor";
import { UsagePanel } from "@/components/usage";
import { PageHeader } from "@/components/shell";
import { Button, ConfirmDialog, LANG_OPTIONS, Segmented, Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { CHAT_RETENTION_DAYS } from "@/lib/config";
import { useNow } from "@/lib/hooks";
import { useLang, useT } from "@/lib/i18n";
import { MODELS } from "@/lib/models";
import { useActiveProfile, useAppStore, useVisibleModels } from "@/lib/store";
import type { Theme } from "@/lib/types";

function Section({ title, help, children }: { title: string; help?: string; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {help && <p className="mt-1 text-sm text-muted">{help}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

const INPUT =
  "h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none focus:border-accent aria-[invalid=true]:border-danger";

/** Change the shared family password. Signs out every other device. */
function FamilyPasswordForm() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.trim().length >= 8 && next === confirm;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setResult(null);
    try {
      await api("/api/family-password", { method: "PUT", body: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setResult({ ok: true, text: t("password.changed") });
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      const text =
        e?.status === 429
          ? t("login.wait", { seconds: e.retryAfter ?? 30 })
          : e?.code === "wrong-password"
            ? t("password.wrongCurrent")
            : e?.code === "same-password"
              ? t("password.same")
              : e?.code === "too-short"
                ? t("password.tooShort")
                : t("error.generic");
      setResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-3"
    >
      {/* Lets password managers file the change under the right site. */}
      <input type="text" name="username" autoComplete="username" value="family" readOnly hidden />
      <div>
        <label htmlFor="pw-current" className="mb-1.5 block text-sm font-medium">
          {t("password.current")}
        </label>
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setResult(null);
          }}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="pw-new" className="mb-1.5 block text-sm font-medium">
          {t("password.new")}
        </label>
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setResult(null);
          }}
          aria-describedby="pw-rule"
          className={INPUT}
        />
        <p id="pw-rule" className="mt-1 text-xs text-muted">
          {t("password.rule")}
        </p>
      </div>
      <div>
        <label htmlFor="pw-confirm" className="mb-1.5 block text-sm font-medium">
          {t("password.confirm")}
        </label>
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setResult(null);
          }}
          aria-invalid={mismatch}
          aria-describedby={mismatch ? "pw-mismatch" : undefined}
          className={INPUT}
        />
        {mismatch && (
          <p id="pw-mismatch" className="mt-1 text-xs text-danger">
            {t("password.mismatch")}
          </p>
        )}
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={clsx("flex items-start gap-1.5 text-sm", result.ok ? "text-text" : "text-danger")}>
          {result.ok && <Check className="mt-0.5 size-4 shrink-0 text-accent-text" />}
          {result.text}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        {t("password.submit")}
      </Button>
    </form>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_CHOICES = ["7", "30", "all"] as const;

/** Delete your own old chats now. Chats kept forever always stay. */
function ChatHistoryCleanup() {
  const t = useT();
  const chats = useAppStore((s) => s.chats);
  const cleanupChats = useAppStore((s) => s.cleanupChats);
  const now = useNow();
  const [choice, setChoice] = useState<(typeof CLEANUP_CHOICES)[number]>("30");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const days = choice === "all" ? null : Number(choice);
  const count = useMemo(
    () =>
      chats.filter(
        (c) =>
          !c.pinned &&
          // A brand-new chat without messages only exists in this browser.
          !(c.loaded && c.messages.length === 0) &&
          (days === null || c.updatedAt < now - days * DAY_MS),
      ).length,
    [chats, days, now],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cleanup-range" className="mb-1.5 block text-sm font-medium">
            {t("history.which")}
          </label>
          <select
            id="cleanup-range"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value as (typeof CLEANUP_CHOICES)[number]);
              setResult(null);
            }}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          >
            {CLEANUP_CHOICES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? t("history.all") : t("history.older", { n: c })}
              </option>
            ))}
          </select>
        </div>
        <Button variant="danger" disabled={count === 0} onClick={() => setConfirming(true)}>
          {t("history.delete")}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {count === 0 ? t("history.none") : count === 1 ? t("history.countOne") : t("history.count", { count })}
      </p>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={clsx("flex items-start gap-1.5 text-sm", result.ok ? "text-text" : "text-danger")}>
          {result.ok && <Check className="mt-0.5 size-4 shrink-0 text-accent-text" />}
          {result.text}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={count === 1 ? t("history.confirmTitleOne") : t("history.confirmTitle", { count })}
        body={t("history.confirmBody")}
        confirmLabel={t("history.delete")}
        onConfirm={() => {
          setConfirming(false);
          cleanupChats(days).then(
            (deleted) =>
              setResult({ ok: true, text: deleted === 1 ? t("history.deletedOne") : t("history.deleted", { count: deleted }) }),
            () => setResult({ ok: false, text: t("error.generic") }),
          );
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const profile = useActiveProfile();
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const setDefaultModel = useAppStore((s) => s.setDefaultModel);
  const setModelHidden = useAppStore((s) => s.setModelHidden);
  const setTheme = useAppStore((s) => s.setTheme);
  const setEnterToSend = useAppStore((s) => s.setEnterToSend);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const lockDevice = useAppStore((s) => s.lockDevice);
  const visible = useVisibleModels();
  const adminName = profiles.find((p) => p.isAdmin)?.name ?? "";
  const [editing, setEditing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!profile) return null;
  const themes: ReadonlyArray<{ value: Theme; label: string }> = [
    { value: "system", label: t("settings.theme.system") },
    { value: "light", label: t("settings.theme.light") },
    { value: "dark", label: t("settings.theme.dark") },
  ];

  return (
    <>
      <PageHeader title={<h1 className="text-base font-semibold">{t("settings.title")}</h1>} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
          {!profile.isAdmin && <Section title={t("settings.family")} help={t("admin.managedBy", { name: adminName })} />}

          {profile.isAdmin && (
            <>
            <Section title={t("settings.defaultModel")} help={t("settings.defaultModelHelp")}>
              <div role="radiogroup" aria-label={t("settings.defaultModel")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visible.map((m) => {
                  const selected = m.id === settings.defaultModelId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDefaultModel(m.id)}
                      className={clsx(
                        "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,transform] active:scale-[0.98]",
                        selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <ModelAvatar model={m} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="block truncate text-xs text-muted">{m.description[lang]}</span>
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-accent-text" />}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title={t("settings.visible")} help={t("settings.visibleHelp")}>
              <ul className="divide-y divide-border">
                {MODELS.map((m) => {
                  const hidden = settings.hiddenModelIds.includes(m.id);
                  const locked = m.id === settings.defaultModelId || (!hidden && visible.length <= 1);
                  return (
                    <li key={m.id} className="flex min-h-14 items-center gap-3 py-2">
                      <ModelAvatar model={m} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="block truncate font-mono text-xs text-muted">{m.id}</span>
                      </span>
                      <Toggle
                        label={t("settings.show", { name: m.name })}
                        checked={!hidden}
                        disabled={locked}
                        onChange={(on) => setModelHidden(m.id, !on)}
                      />
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title={t("usage.title")} help={t("usage.help", { days: CHAT_RETENTION_DAYS })}>
              <UsagePanel />
            </Section>
            </>
          )}

          <Section title={t("settings.appearance")}>
            <Segmented label={t("settings.appearance")} value={settings.theme} options={themes} onChange={setTheme} />
          </Section>

          <Section title={t("settings.chat")}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{t("settings.enter")}</div>
                <div className="text-xs text-muted">{t("settings.enterHelp")}</div>
              </div>
              <Toggle label={t("settings.enter")} checked={settings.enterToSend} onChange={setEnterToSend} />
            </div>
          </Section>

          <Section title={t("settings.profile")}>
            <div className="flex flex-wrap items-center gap-3">
              <ProfileAvatar profile={profile} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{profile.name}</div>
                <div className="text-xs text-muted">{profile.hasPin ? t("settings.pinOn") : t("settings.pinOff")}</div>
                {profile.isAdmin && !profile.hasPin && <div className="mt-1 text-xs text-danger">{t("admin.addPin")}</div>}
              </div>
              <Button onClick={() => setEditing(true)}>{t("settings.editProfile")}</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <div className="text-sm font-medium">{t("language")}</div>
                <div className="text-xs text-muted">{t("settings.languageHelp")}</div>
              </div>
              <Segmented
                label={t("language")}
                value={profile.language}
                options={LANG_OPTIONS}
                onChange={(language) => void updateProfile(profile.id, { language }).catch(() => undefined)}
              />
            </div>
          </Section>

          {profile.isAdmin && (
            <Section title={t("password.title")} help={t("password.help")}>
              <FamilyPasswordForm />
            </Section>
          )}

          <Section title={t("history.title")} help={t("history.help", { days: CHAT_RETENTION_DAYS })}>
            <ChatHistoryCleanup />
          </Section>

          <Section title={t("settings.device")} help={t("settings.logoutHelp")}>
            <Button variant="danger" onClick={() => setConfirmLogout(true)}>
              {t("profiles.logout")}
            </Button>
          </Section>

        </div>
      </div>

      {/* Deleting profiles is the admin's job, from "Manage profiles"; nobody deletes themselves here. */}
      {editing && <ProfileEditor key={profile.id} profile={profile} canDelete={false} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title={t("settings.logoutConfirm")}
        body={t("settings.logoutBody")}
        confirmLabel={t("settings.logoutButton")}
        onConfirm={() => {
          lockDevice();
          router.replace("/login");
        }}
      />
    </>
  );
}
